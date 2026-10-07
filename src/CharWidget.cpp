// SPDX-License-Identifier: GPL-2.0-or-later
#include "CharWidgetProjection.h"
#include "CharWidgetSender.h"
#include "Config.h"
#include "WidgetWatch.h"
#include "CryptoRandom.h"
#include "Log.h"
#include "Player.h"
#include "PlayerScript.h"
#include "StringFormat.h"
#include "World.h"
#include "WorldScript.h"
#include "WorldSession.h"
#include "WorldSessionMgr.h"
#include <boost/uuid/uuid.hpp>
#include <boost/uuid/uuid_io.hpp>
#include <algorithm>
#include <atomic>
#include <sstream>
#include <stdexcept>
#include <unordered_set>

namespace CharWidget
{
namespace
{
Time Now() { return std::chrono::steady_clock::now(); }

std::string ProcessId()
{
    auto bytes = Acore::Crypto::GetRandomBytes<16>();
    boost::uuids::uuid id;
    std::copy(bytes.begin(), bytes.end(), id.begin());
    return boost::uuids::to_string(id);
}

std::string Lower(std::string name)
{
    std::transform(name.begin(), name.end(), name.begin(), [](unsigned char c)
    {
        return c >= 'A' && c <= 'Z' ? char(c + 'a' - 'A') : char(c);
    });
    return name;
}

struct Track
{
    Time Next;
    Time NextAchievement;
    Time LastSeen;
    std::map<std::string, std::pair<std::size_t, Time>> Sent;
    Json Achievement;
    Json Revisions = Json::object();
    Json WatchTarget;
    std::size_t CachedBytes = 0;
};

class Service
{
public:
    void Start()
    {
        if (_sender || !sConfigMgr->GetOption<bool>("CharWidget.Enable", true))
            return;
        auto endpoint = sConfigMgr->GetOption<std::string>("CharWidget.Endpoint", "");
        if (endpoint.empty())
            return;
        try
        {
            _interval = sConfigMgr->GetOption<uint32>("CharWidget.UpdateIntervalMs", 2000);
            _reconcile = sConfigMgr->GetOption<uint32>("CharWidget.AchievementReconcileMs", 30000);
            auto queueBytes = sConfigMgr->GetOption<uint32>("CharWidget.QueueBytes", 64 * 1024 * 1024);
            auto source = sConfigMgr->GetOption<std::string>("CharWidget.SourceId",
                Acore::StringFormat("realm-{}", sConfigMgr->GetOption<uint32>("RealmID", 1)));
            if (_interval < 1000 || _interval > 5000 || _reconcile < _interval || _reconcile > 60000 ||
                queueBytes < 8 * 1024 * 1024 || queueBytes > 256 * 1024 * 1024 || source.empty() || source.size() > 256)
                throw std::invalid_argument("invalid character widget limits");
            std::istringstream configured(sConfigMgr->GetOption<std::string>("CharWidget.Characters", ""));
            for (std::string name; std::getline(configured, name, ',');)
            {
                auto begin = name.find_first_not_of(" \t");
                auto end = name.find_last_not_of(" \t");
                if (begin != std::string::npos)
                    _allowlist.insert(Lower(name.substr(begin, end - begin + 1)));
            }
            HttpOptions http;
            http.Destination = ParseEndpoint(endpoint);
            http.BearerToken = sConfigMgr->GetOption<std::string>("CharWidget.BearerToken", "");
            http.CaFile = sConfigMgr->GetOption<std::string>("CharWidget.CAFile", "");
            http.ConnectTimeout = Milliseconds(sConfigMgr->GetOption<uint32>("CharWidget.ConnectTimeoutMs", 750));
            http.RequestTimeout = Milliseconds(sConfigMgr->GetOption<uint32>("CharWidget.RequestTimeoutMs", 1500));
            if (http.RequestTimeout > Milliseconds(3000))
                throw std::invalid_argument("request timeout exceeds freshness budget");
            _process = ProcessId();
            _metadata.Load(std::filesystem::path(sWorld->GetDataPath()) / "dbc");
            _projection = std::make_unique<Projection>(_metadata);
            auto catalog = CatalogChunks(_projection->Catalog(), source, _process, _process);
            _sender = std::make_unique<Sender>(std::move(http), source, _process, queueBytes, std::move(catalog));
            _enabled.store(true);
            LOG_INFO("module.charwidget", "Character widgets enabled; sample interval {}ms", _interval);
        }
        catch (std::exception const&)
        {
            LOG_ERROR("module.charwidget", "Invalid character widget configuration or catalogue; capture disabled");
        }
    }

    void Stop()
    {
        _enabled.store(false);
        _sender.reset();
        _tracked.clear();
        _cacheBytes = 0;
    }

    void Dirty(Player* player)
    {
        if (!_enabled.load())
            return;
        std::lock_guard lock(_dirtyMutex);
        if (_dirty.size() < 10000)
            _dirty.insert(player->GetGUID().ToString());
    }

    void Update()
    {
        if (!_sender)
            return;
        auto now = Now();
        bool checkWatch = now >= _nextWatch;
        if (checkWatch)
            _nextWatch = now + Milliseconds(250);
        unsigned captured = 0;
        // The world hook runs after map workers join. All live object reads finish in this call.
        for (auto const& [account, session] : sWorldSessionMgr->GetAllSessions())
        {
            static_cast<void>(account);
            auto player = session->GetPlayer();
            if (!player || session->PlayerLogout() || !Allowed(player))
                continue;
            auto guid = player->GetGUID().ToString();
            auto found = _tracked.find(guid);
            if (found == _tracked.end())
            {
                if (_tracked.size() >= 10000)
                    continue;
                found = _tracked.emplace(guid, Track{}).first;
                found->second.Next = now + Milliseconds(std::hash<std::string>{}(guid) % _interval);
            }
            auto& track = found->second;
            track.LastSeen = now;
            if (checkWatch)
            {
                auto target = WidgetWatch::Capture<Json>(player);
                if (target != track.WatchTarget)
                {
                    track.WatchTarget = std::move(target);
                    Push(player, "presence", {{"presence", player->IsInWorld() && !player->IsBeingTeleported()
                        && track.Revisions.size() == 7
                        ? "online" : "unavailable"}, {"revisions", track.Revisions}}, now);
                }
            }
            if (now < track.Next || captured >= 8)
                continue;
            ++captured;
            track.Next = now + Milliseconds(_interval);
            if (!player->IsInWorld() || player->IsBeingTeleported())
            {
                Push(player, "presence", {{"presence", "unavailable"}}, now);
                continue;
            }
            try
            {
                bool dirty;
                {
                    std::lock_guard lock(_dirtyMutex);
                    dirty = _dirty.erase(guid) != 0;
                }
                bool refresh = dirty || now >= track.NextAchievement || track.Achievement.is_null();
                auto panels = _projection->Capture(player, refresh);
                if (refresh)
                {
                    auto& achievement = panels.at("achievements");
                    auto size = achievement.dump().size() * 2;
                    _cacheBytes -= track.CachedBytes;
                    track.CachedBytes = 0;
                    track.Achievement = nullptr;
                    if (_cacheBytes + size <= 64 * 1024 * 1024)
                    {
                        track.Achievement = achievement;
                        track.CachedBytes = size;
                        _cacheBytes += size;
                    }
                    track.NextAchievement = now + Milliseconds(_reconcile);
                }
                else
                    panels.emplace("achievements", track.Achievement);
                for (auto& [panel, data] : panels)
                {
                    auto fingerprint = std::hash<std::string>{}(data.dump());
                    auto& sent = track.Sent[panel];
                    if (sent.second == Time{} || fingerprint != sent.first || now - sent.second >= Milliseconds(10000))
                    {
                        track.Revisions[panel] = std::to_string(Push(player, panel, std::move(data), now));
                        sent = {fingerprint, now};
                    }
                }
                Push(player, "presence", {{"presence", "online"}, {"revisions", track.Revisions}}, now);
            }
            catch (std::exception const&)
            {
                Dirty(player);
                if (now >= _nextError)
                {
                    LOG_WARN("module.charwidget", "Unable to capture character panels; waiting for next sample");
                    _nextError = now + std::chrono::seconds(30);
                }
            }
        }
        for (auto it = _tracked.begin(); it != _tracked.end();)
            if (now - it->second.LastSeen > std::chrono::minutes(1))
            {
                _cacheBytes -= it->second.CachedBytes;
                it = _tracked.erase(it);
            }
            else
                ++it;
    }

    void Logout(Player* player)
    {
        if (!_sender || !Allowed(player))
            return;
        Push(player, "presence", {{"presence", "offline"}}, Now());
        auto found = _tracked.find(player->GetGUID().ToString());
        if (found != _tracked.end())
        {
            _cacheBytes -= found->second.CachedBytes;
            _tracked.erase(found);
        }
    }

private:
    bool Allowed(Player* player) const
    {
        return _allowlist.empty() || _allowlist.contains(Lower(player->GetName())) ||
            _allowlist.contains(Lower(player->GetGUID().ToString()));
    }

    std::uint64_t Push(Player* player, std::string const& panel, Json data, Time now)
    {
        if (panel == "presence")
            data["watch_target"] = WidgetWatch::Capture<Json>(player, data["presence"] == "offline");
        auto guid = player->GetGUID().ToString();
        _sender->Push({guid + "/" + panel, ++_sequence, now, {{"guid", guid}, {"name", player->GetName()},
            {"panel", panel}, {"catalog_revision", _process}, {"data", std::move(data)}}});
        return _sequence;
    }

    Metadata _metadata;
    std::unique_ptr<Projection> _projection;
    std::unique_ptr<Sender> _sender;
    std::unordered_map<std::string, Track> _tracked;
    std::unordered_set<std::string> _allowlist;
    std::unordered_set<std::string> _dirty;
    std::mutex _dirtyMutex;
    std::atomic<bool> _enabled{false};
    std::string _process;
    std::uint64_t _sequence = 0;
    std::size_t _cacheBytes = 0;
    uint32 _interval = 2000;
    uint32 _reconcile = 30000;
    Time _nextError{};
    Time _nextWatch{};
};

class World final : public WorldScript
{
public:
    explicit World(std::shared_ptr<Service> service) : WorldScript("CharWidgetWorld",
        {WORLDHOOK_ON_STARTUP, WORLDHOOK_ON_UPDATE, WORLDHOOK_ON_SHUTDOWN, WORLDHOOK_ON_AFTER_CONFIG_LOAD}),
        _service(std::move(service)) { }
    ~World() override { _service->Stop(); }
    void OnStartup() override { _service->Start(); }
    void OnUpdate(uint32) override { _service->Update(); }
    void OnShutdown() override { _service->Stop(); }
    void OnAfterConfigLoad(bool reload) override
    {
        if (reload)
            LOG_INFO("module.charwidget", "Character widget settings are startup-only; restart to apply changes");
    }

private:
    std::shared_ptr<Service> _service;
};

class Players final : public PlayerScript
{
public:
    explicit Players(std::shared_ptr<Service> service) : PlayerScript("CharWidgetPlayers",
        {PLAYERHOOK_ON_BEFORE_LOGOUT, PLAYERHOOK_ON_CRITERIA_PROGRESS, PLAYERHOOK_ON_ACHI_COMPLETE}),
        _service(std::move(service)) { }
    void OnPlayerBeforeLogout(Player* player) override { _service->Logout(player); }
    void OnPlayerCriteriaProgress(Player* player, AchievementCriteriaEntry const*) override { _service->Dirty(player); }
    void OnPlayerAchievementComplete(Player* player, AchievementEntry const*) override { _service->Dirty(player); }

private:
    std::shared_ptr<Service> _service;
};
}
}

void Addmod_char_widgetScripts()
{
    auto service = std::make_shared<CharWidget::Service>();
    new CharWidget::World(service);
    new CharWidget::Players(service);
}
