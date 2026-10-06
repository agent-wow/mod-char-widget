// SPDX-License-Identifier: GPL-2.0-or-later
#ifndef MOD_CHAR_WIDGET_STATE_H
#define MOD_CHAR_WIDGET_STATE_H

#include "../vendor/nlohmann/json.hpp"
#include <chrono>
#include <array>
#include <cstdint>
#include <functional>
#include <list>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace CharWidget
{
using Json = nlohmann::json;
using Time = std::chrono::steady_clock::time_point;
using Milliseconds = std::chrono::milliseconds;
constexpr auto Freshness = Milliseconds(15000);

struct Response
{
    unsigned Status = 0;
    std::chrono::seconds RetryAfter{0};
};

bool Retryable(unsigned status);
Json ReputationProgress(std::int32_t standing);
std::string IconName(std::string path);
unsigned LearnedRank(std::array<std::uint32_t, 5> const& spells, std::function<bool(std::uint32_t)> const& learned);
Json ProjectSlots(std::uint16_t first, std::uint16_t end, std::function<Json(std::uint16_t)> const& read);

struct Snapshot
{
    std::string Key;
    std::uint64_t Sequence = 0;
    Time Captured;
    Json Data;
    std::size_t Bytes = 0;
};

class SnapshotQueue
{
public:
    explicit SnapshotQueue(std::size_t bytes = 64 * 1024 * 1024, std::size_t count = 80000);
    bool Push(Snapshot snapshot);
    std::vector<Snapshot> Take(Time now, std::size_t count = 100, std::size_t bytes = 4 * 1024 * 1024);
    void Retry(std::vector<Snapshot> snapshots, Time now);
    std::size_t Size() const;

private:
    mutable std::mutex _mutex;
    std::list<Snapshot> _items;
    std::unordered_map<std::string, std::list<Snapshot>::iterator> _index;
    std::size_t _bytes = 0;
    std::size_t _maxBytes;
    std::size_t _maxCount;
};

Json Batch(std::string const& source, std::string const& process, std::vector<Snapshot> const& items, Time now);
std::vector<Json> CatalogChunks(Json const& entries, std::string const& source, std::string const& process,
    std::string const& revision);
}

#endif
