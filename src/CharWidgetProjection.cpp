// SPDX-License-Identifier: GPL-2.0-or-later
#include "CharWidgetProjection.h"
#include "AchievementMgr.h"
#include "Bag.h"
#include "DBCStores.h"
#include "Item.h"
#include "ObjectMgr.h"
#include "Player.h"
#include "QuestDef.h"
#include "ReputationMgr.h"
#include "SpellMgr.h"
#include "World.h"
#include <algorithm>
#include <array>
#include <cmath>

namespace CharWidget
{
namespace
{
std::string Name(char const* value, std::string fallback = "Unknown")
{
    return value && *value ? value : fallback;
}

std::string SpellName(uint32 id)
{
    auto spell = sSpellMgr->GetSpellInfo(id);
    return spell ? Name(spell->SpellName[LOCALE_enUS]) : "Spell " + std::to_string(id);
}

std::string StatName(uint32 id)
{
    static std::map<uint32, std::string> const names{{0, "Mana"}, {1, "Health"}, {3, "Agility"},
        {4, "Strength"}, {5, "Intellect"}, {6, "Spirit"}, {7, "Stamina"}, {12, "Defense rating"},
        {13, "Dodge rating"}, {14, "Parry rating"}, {15, "Block rating"}, {16, "Melee hit rating"},
        {17, "Ranged hit rating"}, {18, "Spell hit rating"}, {19, "Melee crit rating"},
        {20, "Ranged crit rating"}, {21, "Spell crit rating"}, {28, "Melee haste rating"},
        {29, "Ranged haste rating"}, {30, "Spell haste rating"}, {31, "Hit rating"}, {32, "Crit rating"},
        {35, "Resilience rating"}, {36, "Haste rating"}, {37, "Expertise rating"}, {38, "Attack power"},
        {39, "Ranged attack power"}, {43, "Mana per 5 sec"}, {44, "Armor penetration rating"},
        {45, "Spell power"}, {46, "Health per 5 sec"}, {47, "Spell penetration"}, {48, "Block value"}};
    auto found = names.find(id);
    return found == names.end() ? "Stat " + std::to_string(id) : found->second;
}

Json Target(AchievementCriteriaEntry const* criteria)
{
    switch (criteria->requiredType)
    {
        case ACHIEVEMENT_CRITERIA_TYPE_COMPLETE_ACHIEVEMENT:
        case ACHIEVEMENT_CRITERIA_TYPE_COMPLETE_QUEST:
        case ACHIEVEMENT_CRITERIA_TYPE_LEARN_SPELL:
        case ACHIEVEMENT_CRITERIA_TYPE_EXPLORE_AREA:
        case ACHIEVEMENT_CRITERIA_TYPE_ON_LOGIN:
        case ACHIEVEMENT_CRITERIA_TYPE_OWN_RANK:
            return 1;
        case ACHIEVEMENT_CRITERIA_TYPE_LEARN_SKILL_LEVEL:
            return criteria->raw.count * 75;
        case ACHIEVEMENT_CRITERIA_TYPE_EARN_ACHIEVEMENT_POINTS:
            return 9000;
        default:
            return criteria->raw.count ? Json(criteria->raw.count) : Json(nullptr);
    }
}

void AddStat(Json& stats, char const* group, std::string const& label, double value)
{
    stats.push_back({{"group", group}, {"label", label}, {"value", std::isfinite(value) ? value : 0}});
}
}

Json Projection::Catalog() const
{
    auto result = Json::array();
    auto add = [&result](char const* kind, Json value)
    {
        result.push_back({{"kind", kind}, {"data", std::move(value)}});
    };
    for (auto achievement : sAchievementStore)
        add("achievements", {{"id", achievement->ID}, {"name", Name(achievement->name[LOCALE_enUS])},
            {"description", _metadata.Text("Achievement", achievement->ID, 21, "Description unavailable")},
            {"category", achievement->categoryId}, {"points", achievement->points},
            {"flags", achievement->flags}, {"faction", achievement->requiredFaction},
            {"icon", _metadata.Icon(_metadata.Number("Achievement", achievement->ID, 42))},
            {"ref", achievement->refAchievement}, {"count", achievement->count}});
    for (auto criteria : sAchievementCriteriaStore)
    {
        auto achievement = sAchievementStore.LookupEntry(criteria->referredAchievement);
        add("criteria", {{"id", criteria->ID}, {"achievement", criteria->referredAchievement},
            {"name", _metadata.Text("Achievement_Criteria", criteria->ID, 9,
                "Criterion " + std::to_string(criteria->ID))}, {"type", criteria->requiredType},
            {"asset", criteria->raw.field3},
            {"target", achievement && (achievement->flags & ACHIEVEMENT_FLAG_COUNTER) ?
                Json(nullptr) : Target(criteria)},
            {"order", _metadata.Number("Achievement_Criteria", criteria->ID, 30)}});
    }
    for (auto category : sAchievementCategoryStore)
        add("categories", {{"id", category->ID}, {"parent", category->parentCategory},
            {"name", _metadata.Text("Achievement_Category", category->ID, 2,
                "Category " + std::to_string(category->ID))},
            {"order", _metadata.Number("Achievement_Category", category->ID, 19)}});
    for (auto tree : sTalentTabStore)
        if (tree->ClassMask && tree->tabpage < 3)
            add("trees", {{"id", tree->TalentTabID}, {"class_mask", tree->ClassMask}, {"page", tree->tabpage},
                {"name", _metadata.Text("TalentTab", tree->TalentTabID, 1,
                    "Talent tree " + std::to_string(tree->TalentTabID))},
                {"icon", _metadata.Icon(_metadata.Number("TalentTab", tree->TalentTabID, 18))}});
    for (auto talent : sTalentStore)
    {
        auto tree = sTalentTabStore.LookupEntry(talent->TalentTab);
        if (!tree || !tree->ClassMask || tree->tabpage >= 3)
            continue;
        auto ranks = Json::array();
        for (auto id : talent->RankID)
            if (auto spell = sSpellMgr->GetSpellInfo(id))
                ranks.push_back({{"id", id}, {"name", SpellName(id)}, {"icon", _metadata.Icon(spell->SpellIconID)}});
        if (!ranks.empty())
            add("talents", {{"id", talent->TalentID}, {"tree", talent->TalentTab}, {"row", talent->Row},
                {"col", talent->Col}, {"depends_on", talent->DependsOn}, {"depends_rank", talent->DependsOnRank + 1},
                {"ranks", std::move(ranks)}});
    }
    return result;
}

Json Projection::ItemData(ItemTemplate const* proto, Item const* item, uint32 count) const
{
    if (!proto)
        return nullptr;
    auto display = sItemDisplayInfoStore.LookupEntry(proto->DisplayInfoID);
    auto distribution = sScalingStatDistributionStore.LookupEntry(proto->ScalingStatDistribution);
    auto owner = item ? item->GetOwner() : nullptr;
    auto level = owner ? owner->GetLevel() : proto->RequiredLevel;
    if (distribution)
        level = std::min(level, distribution->MaxLevel);
    auto scaling = proto->ScalingStatValue ? sScalingStatValuesStore.LookupEntry(level) : nullptr;
    std::string name = proto->Name1;
    if (item && item->GetItemRandomPropertyId())
    {
        auto property = item->GetItemRandomPropertyId();
        if (property > 0)
        {
            if (auto suffix = sItemRandomPropertiesStore.LookupEntry(property))
                name += " " + Name(suffix->Name[LOCALE_enUS], "");
        }
        else if (auto suffix = sItemRandomSuffixStore.LookupEntry(-int64(property)))
            name += " " + Name(suffix->Name[LOCALE_enUS], "");
    }
    Json result = {{"id", proto->ItemId}, {"name", name}, {"quality", proto->Quality},
        {"icon", display ? IconName(Name(display->inventoryIcon, "")) : ""},
        {"count", item ? item->GetCount() : count}, {"level", proto->ItemLevel},
        {"required_level", proto->RequiredLevel}, {"inventory_type", proto->InventoryType},
        {"durability", item ? item->GetUInt32Value(ITEM_FIELD_DURABILITY) : proto->MaxDurability},
        {"max_durability", item ? item->GetUInt32Value(ITEM_FIELD_MAXDURABILITY) : proto->MaxDurability},
        {"bound", item && item->IsSoulBound()}, {"description", proto->Description}, {"armor", proto->Armor},
        {"delay_ms", proto->Delay}, {"sell_price", proto->SellPrice}, {"stats", Json::array()},
        {"enchants", Json::array()}, {"sockets", Json::array()}, {"spells", Json::array()}, {"damage", Json::array()}};
    if (scaling && distribution)
    {
        for (uint8 i = 0; i < MAX_ITEM_PROTO_STATS; ++i)
            if (distribution->StatMod[i] >= 0)
                AddStat(result["stats"], "Item", StatName(distribution->StatMod[i]),
                    scaling->getssdMultiplier(proto->ScalingStatValue) * distribution->Modifier[i] / 10000);
    }
    else
        for (uint32 i = 0; i < std::min<uint32>(proto->StatsCount, MAX_ITEM_PROTO_STATS); ++i)
            AddStat(result["stats"], "Item", StatName(proto->ItemStat[i].ItemStatType),
                proto->ItemStat[i].ItemStatValue);
    if (scaling)
    {
        if (auto armor = scaling->getArmorMod(proto->ScalingStatValue))
            result["armor"] = armor;
        if (auto bonus = scaling->getSpellBonus(proto->ScalingStatValue))
            AddStat(result["stats"], "Item", "Spell power", bonus);
    }
    for (uint8 i = 0; i < MAX_ITEM_PROTO_DAMAGES; ++i)
    {
        auto const& damage = proto->Damage[i];
        double low = damage.DamageMin;
        double high = damage.DamageMax;
        if (!i && scaling)
            if (auto dps = scaling->getDPSMod(proto->ScalingStatValue))
            {
                auto average = dps * proto->Delay / 1000.0;
                auto spread = scaling->IsTwoHand(proto->ScalingStatValue) ? 0.2 : 0.3;
                low = average * (1 - spread);
                high = average * (1 + spread);
            }
        if (high > 0)
            result["damage"].push_back({{"min", low}, {"max", high}, {"school", damage.DamageType}});
    }
    for (auto const& spell : proto->Spells)
        if (spell.SpellId > 0)
            result["spells"].push_back({{"id", spell.SpellId}, {"name", SpellName(spell.SpellId)},
                {"trigger", spell.SpellTrigger}});
    if (item)
        for (uint8 i = 0; i < MAX_ENCHANTMENT_SLOT; ++i)
            if (uint32 id = item->GetEnchantmentId(static_cast<EnchantmentSlot>(i)))
            {
                auto enchant = sSpellItemEnchantmentStore.LookupEntry(id);
                result["enchants"].push_back({{"id", id},
                    {"name", enchant ? Name(enchant->description[LOCALE_enUS]) : "Enchantment " + std::to_string(id)},
                    {"gem", i >= SOCK_ENCHANTMENT_SLOT && i <= SOCK_ENCHANTMENT_SLOT_3}});
            }
    for (uint8 i = 0; i < MAX_ITEM_PROTO_SOCKETS; ++i)
    {
        auto enchant = item ? sSpellItemEnchantmentStore.LookupEntry(
            item->GetEnchantmentId(static_cast<EnchantmentSlot>(SOCK_ENCHANTMENT_SLOT + i))) : nullptr;
        if (proto->Socket[i].Color || enchant)
            result["sockets"].push_back({{"color", proto->Socket[i].Color}, {"gem_id", enchant ? enchant->GemID : 0}});
    }
    return result;
}

Json Projection::Info(Player* player) const
{
    auto race = sChrRacesStore.LookupEntry(player->getRace());
    std::string title;
    auto titleIndex = player->GetUInt32Value(PLAYER_CHOSEN_TITLE);
    for (auto entry : sCharTitlesStore)
        if (titleIndex && entry->bit_index == titleIndex)
        {
            title = Name(player->getGender() == GENDER_FEMALE ? entry->nameFemale[LOCALE_enUS] :
                entry->nameMale[LOCALE_enUS], "");
            auto placeholder = title.find("%s");
            if (placeholder != std::string::npos)
                title.replace(placeholder, 2, player->GetName());
            break;
        }
    Json info = {{"race", race ? Name(race->name[LOCALE_enUS]) : "Unknown race"},
        {"class_id", player->getClass()}, {"level", player->GetLevel()}, {"title", title},
        {"guild", player->GetGuildId() ? player->GetGuildName() : ""},
        {"xp", player->GetUInt32Value(PLAYER_XP)}, {"max_xp", player->GetUInt32Value(PLAYER_NEXT_LEVEL_XP)},
        {"rested", player->GetRestBonus()}, {"health", player->GetHealth()}, {"max_health", player->GetMaxHealth()},
        {"stats", Json::array()}, {"equipment", Json::array()}};
    auto& stats = info["stats"];
    constexpr std::array<char const*, 5> attributes{"Strength", "Agility", "Stamina", "Intellect", "Spirit"};
    for (uint8 i = 0; i < attributes.size(); ++i)
        AddStat(stats, "Attributes", attributes[i], player->GetStat(static_cast<Stats>(i)));
    for (auto const& [label, field] : std::vector<std::pair<char const*, uint16>>{
        {"Min damage", UNIT_FIELD_MINDAMAGE}, {"Max damage", UNIT_FIELD_MAXDAMAGE},
        {"Off-hand min", UNIT_FIELD_MINOFFHANDDAMAGE}, {"Off-hand max", UNIT_FIELD_MAXOFFHANDDAMAGE},
        {"Crit %", PLAYER_CRIT_PERCENTAGE}})
        AddStat(stats, "Melee", label, player->GetFloatValue(field));
    AddStat(stats, "Melee", "Attack power", player->GetTotalAttackPowerValue(BASE_ATTACK));
    AddStat(stats, "Melee", "Speed (sec)", player->GetAttackTime(BASE_ATTACK) / 1000.0);
    AddStat(stats, "Melee", "Hit rating", player->GetUInt32Value(PLAYER_FIELD_COMBAT_RATING_1 + CR_HIT_MELEE));
    AddStat(stats, "Melee", "Expertise rating", player->GetUInt32Value(PLAYER_FIELD_COMBAT_RATING_1 + CR_EXPERTISE));
    AddStat(stats, "Ranged", "Attack power", player->GetTotalAttackPowerValue(RANGED_ATTACK));
    AddStat(stats, "Ranged", "Min damage", player->GetFloatValue(UNIT_FIELD_MINRANGEDDAMAGE));
    AddStat(stats, "Ranged", "Max damage", player->GetFloatValue(UNIT_FIELD_MAXRANGEDDAMAGE));
    AddStat(stats, "Ranged", "Speed (sec)", player->GetAttackTime(RANGED_ATTACK) / 1000.0);
    AddStat(stats, "Ranged", "Crit %", player->GetFloatValue(PLAYER_RANGED_CRIT_PERCENTAGE));
    AddStat(stats, "Ranged", "Hit rating", player->GetUInt32Value(PLAYER_FIELD_COMBAT_RATING_1 + CR_HIT_RANGED));
    constexpr std::array<char const*, 7> schools{"Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane"};
    for (uint8 i = SPELL_SCHOOL_HOLY; i < MAX_SPELL_SCHOOL; ++i)
    {
        AddStat(stats, "Spell", std::string(schools[i]) + " power",
            int64(player->GetInt32Value(PLAYER_FIELD_MOD_DAMAGE_DONE_POS + i)) +
            int64(player->GetInt32Value(PLAYER_FIELD_MOD_DAMAGE_DONE_NEG + i)));
        AddStat(stats, "Spell", std::string(schools[i]) + " crit %",
            player->GetFloatValue(PLAYER_SPELL_CRIT_PERCENTAGE1 + i));
        AddStat(stats, "Defense", std::string(schools[i]) + " resistance",
            player->GetResistance(static_cast<SpellSchools>(i)));
    }
    AddStat(stats, "Spell", "Healing", player->GetUInt32Value(PLAYER_FIELD_MOD_HEALING_DONE_POS));
    AddStat(stats, "Spell", "Hit rating", player->GetUInt32Value(PLAYER_FIELD_COMBAT_RATING_1 + CR_HIT_SPELL));
    AddStat(stats, "Spell", "Haste rating", player->GetUInt32Value(PLAYER_FIELD_COMBAT_RATING_1 + CR_HASTE_SPELL));
    AddStat(stats, "Defense", "Armor", player->GetArmor());
    AddStat(stats, "Defense", "Defense skill", player->GetSkillValue(SKILL_DEFENSE));
    AddStat(stats, "Defense", "Dodge %", player->GetFloatValue(PLAYER_DODGE_PERCENTAGE));
    AddStat(stats, "Defense", "Parry %", player->GetFloatValue(PLAYER_PARRY_PERCENTAGE));
    AddStat(stats, "Defense", "Block %", player->GetFloatValue(PLAYER_BLOCK_PERCENTAGE));
    for (uint8 slot = EQUIPMENT_SLOT_START; slot < EQUIPMENT_SLOT_END; ++slot)
    {
        auto item = player->GetItemByPos(INVENTORY_SLOT_BAG_0, slot);
        info["equipment"].push_back({{"slot", slot},
            {"item", item ? ItemData(item->GetTemplate(), item) : Json(nullptr)}});
    }
    return info;
}

Json Projection::Reputations(Player* player) const
{
    auto factions = Json::array();
    auto watched = player->GetInt32Value(PLAYER_FIELD_WATCHED_FACTION_INDEX);
    for (auto const& [index, state] : player->GetReputationMgr().GetStateList())
    {
        if (!(state.Flags & FACTION_FLAG_VISIBLE))
            continue;
        auto faction = sFactionStore.LookupEntry(state.ID);
        if (!faction)
            continue;
        auto parent = sFactionStore.LookupEntry(faction->team);
        auto data = ReputationProgress(player->GetReputationMgr().GetReputation(faction));
        data.update({{"id", state.ID}, {"name", Name(faction->name[LOCALE_enUS])},
            {"group", parent ? Name(parent->name[LOCALE_enUS]) : "Other"}, {"watched", watched == int32(index)},
            {"inactive", bool(state.Flags & FACTION_FLAG_INACTIVE)},
            {"at_war", bool(state.Flags & FACTION_FLAG_AT_WAR)}});
        factions.push_back(std::move(data));
    }
    return {{"factions", std::move(factions)}};
}

Json Projection::Skills(Player* player) const
{
    static std::map<uint32, char const*> const categories{{SKILL_CATEGORY_ATTRIBUTES, "Attributes"},
        {SKILL_CATEGORY_WEAPON, "Weapon skills"}, {SKILL_CATEGORY_CLASS, "Class skills"},
        {SKILL_CATEGORY_ARMOR, "Armor"}, {SKILL_CATEGORY_SECONDARY, "Secondary skills"},
        {SKILL_CATEGORY_LANGUAGES, "Languages"}, {SKILL_CATEGORY_PROFESSION, "Professions"},
        {SKILL_CATEGORY_GENERIC, "General"}};
    auto skills = Json::array();
    for (auto const& [id, status] : player->GetSkillStatusMap())
    {
        static_cast<void>(status);
        auto skill = sSkillLineStore.LookupEntry(id);
        if (!skill || !player->HasSkill(id))
            continue;
        auto category = categories.find(skill->categoryId);
        skills.push_back({{"id", id}, {"name", Name(skill->name[LOCALE_enUS])},
            {"category", category == categories.end() ? "Other" : category->second},
            {"value", player->GetPureSkillValue(id)}, {"max", player->GetPureMaxSkillValue(id)},
            {"permanent_bonus", player->GetSkillPermBonusValue(id)},
            {"temporary_bonus", player->GetSkillTempBonusValue(id)}, {"icon", _metadata.Icon(skill->spellIcon)}});
    }
    return {{"skills", std::move(skills)}};
}

Json Projection::Talents(Player* player) const
{
    Json data = {{"class_id", player->getClass()}, {"active_spec", player->GetActiveSpec()},
        {"spec_count", player->GetSpecsCount()}, {"free_points", player->GetFreeTalentPoints()},
        {"specs", Json::array()}, {"glyphs", Json::array()}};
    for (uint8 spec = 0; spec < player->GetSpecsCount(); ++spec)
    {
        std::array<uint32, 3> points{};
        auto ranks = Json::array();
        for (auto talent : sTalentStore)
        {
            auto tree = sTalentTabStore.LookupEntry(talent->TalentTab);
            if (!tree || !(tree->ClassMask & player->getClassMask()) || tree->tabpage >= points.size())
                continue;
            auto rank = LearnedRank(talent->RankID, [player, spec](uint32 id) { return player->HasTalent(id, spec); });
            if (rank)
            {
                ranks.push_back({{"id", talent->TalentID}, {"rank", rank}});
                points[tree->tabpage] += rank;
            }
        }
        data["specs"].push_back({{"index", spec}, {"points", points}, {"ranks", std::move(ranks)}});
    }
    for (uint8 slot = 0; slot < MAX_GLYPH_SLOT_INDEX; ++slot)
    {
        auto glyph = sGlyphPropertiesStore.LookupEntry(player->GetGlyph(slot));
        auto glyphSlot = sGlyphSlotStore.LookupEntry(player->GetGlyphSlot(slot));
        auto spell = glyph ? sSpellMgr->GetSpellInfo(glyph->SpellId) : nullptr;
        data["glyphs"].push_back({{"slot", slot}, {"id", glyph ? glyph->Id : 0},
            {"spell_id", glyph ? glyph->SpellId : 0}, {"name", glyph ? SpellName(glyph->SpellId) : "Empty glyph"},
            {"major", glyphSlot && !glyphSlot->TypeFlags},
            {"enabled", bool(player->GetUInt32Value(PLAYER_GLYPHS_ENABLED) & (1 << slot))},
            {"icon", spell ? _metadata.Icon(spell->SpellIconID) : ""}});
    }
    return data;
}

Json Projection::Achievements(Player* player) const
{
    auto mgr = player->GetAchievementMgr();
    auto earned = Json::array();
    auto progress = Json::array();
    uint32 points = 0;
    for (auto const& [id, state] : mgr->GetCompletedAchievements())
    {
        earned.push_back({{"id", id}, {"date", state.date}});
        if (auto achievement = sAchievementStore.LookupEntry(id))
            points += achievement->points;
    }
    for (auto criterion : sAchievementCriteriaStore)
        if (auto state = mgr->GetCriteriaProgress(criterion))
            progress.push_back({{"id", criterion->ID}, {"counter", state->counter}, {"date", state->date}});
    std::sort(earned.begin(), earned.end(), [](Json const& a, Json const& b) { return a["id"] < b["id"]; });
    return {{"points", points}, {"faction", player->GetTeamId() == TEAM_ALLIANCE ? 1 : 0},
        {"earned", std::move(earned)}, {"progress", std::move(progress)}};
}

Json Projection::Quests(Player* player) const
{
    auto quests = Json::array();
    for (uint16 slot = 0; slot < MAX_QUEST_LOG_SIZE; ++slot)
    {
        auto id = player->GetQuestSlotQuestId(slot);
        auto quest = sObjectMgr->GetQuestTemplate(id);
        if (!quest)
            continue;
        auto zone = quest->GetZoneOrSort();
        auto area = zone > 0 ? sAreaTableStore.LookupEntry(zone) : nullptr;
        auto group = area ? Name(area->area_name[LOCALE_enUS]) : zone < 0 ?
            _metadata.Text("QuestSort", -int64(zone), 1, "Other quests") : "Other quests";
        auto status = player->GetQuestStatus(id);
        auto const& statuses = player->getQuestStatusMap();
        auto saved = statuses.find(id);
        QuestStatusData const* progress = saved == statuses.end() ? nullptr : &saved->second;
        Json remaining = quest->GetTimeAllowed() && progress ? Json(progress->Timer) : Json(nullptr);
        bool maxLevel = player->GetLevel() >= sWorld->getIntConfig(CONFIG_MAX_PLAYER_LEVEL);
        bool rewarded = player->IsQuestRewarded(id) && !quest->IsDFQuest() &&
            !(quest->IsDaily() || quest->IsWeekly() || quest->IsMonthly());
        Json data = {{"id", id}, {"slot", slot}, {"name", quest->GetTitle()},
            {"level", player->GetQuestLevel(quest)}, {"group", group}, {"details", quest->GetDetails()},
            {"objectives_text", quest->GetObjectives()}, {"remaining_ms", remaining},
            {"status", status == QUEST_STATUS_COMPLETE ? "complete" : status == QUEST_STATUS_FAILED ?
                "failed" : "incomplete"}, {"objectives", Json::array()}, {"rewards", Json::array()},
            {"reward_stats", Json::array()}, {"reward_text", Json::array()},
            {"money", int64(quest->GetRewOrReqMoney(player->GetLevel())) +
                (maxLevel ? quest->GetRewMoneyMaxLevel() : 0)},
            {"xp", maxLevel || rewarded ? 0 : player->CalculateQuestRewardXP(quest)}};
        auto& rewardStats = data["reward_stats"];
        if (auto honor = quest->CalculateHonorGain(player->GetLevel()))
            AddStat(rewardStats, "Reward", "Honor", honor);
        if (auto arena = quest->GetRewArenaPoints())
            AddStat(rewardStats, "Reward", "Arena points", arena);
        if (auto points = quest->GetBonusTalents())
            AddStat(rewardStats, "Reward", "Talent points", points);
        auto reputationSource = quest->IsDaily() ? REPUTATION_SOURCE_DAILY_QUEST :
            quest->IsWeekly() ? REPUTATION_SOURCE_WEEKLY_QUEST : quest->IsMonthly() ? REPUTATION_SOURCE_MONTHLY_QUEST :
            quest->IsRepeatable() ? REPUTATION_SOURCE_REPEATABLE_QUEST : REPUTATION_SOURCE_QUEST;
        for (uint8 i = 0; i < QUEST_REPUTATIONS_COUNT; ++i)
            if (auto faction = sFactionStore.LookupEntry(quest->RewardFactionId[i]))
            {
                float reputation = quest->RewardFactionValueIdOverride[i] / 100.0f;
                if (!quest->RewardFactionValueIdOverride[i])
                {
                    auto row = sQuestFactionRewardStore.LookupEntry(quest->RewardFactionValueId[i] < 0 ? 2 : 1);
                    auto field = std::abs(int64(quest->RewardFactionValueId[i]));
                    if (row && field < 10)
                        reputation = row->QuestRewFactionValue[field];
                }
                AddStat(rewardStats, "Reputation", Name(faction->name[LOCALE_enUS]),
                    player->CalculateReputationGain(reputationSource, player->GetQuestLevel(quest),
                        reputation, faction->ID));
            }
        if (auto spell = quest->GetRewSpell())
            data["reward_text"].push_back("Spell: " + SpellName(spell));
        else if (quest->GetRewSpellCast() > 0)
            data["reward_text"].push_back("Spell: " + SpellName(quest->GetRewSpellCast()));
        if (auto title = sCharTitlesStore.LookupEntry(quest->GetCharTitleId()))
        {
            auto name = Name(player->getGender() == GENDER_FEMALE ?
                title->nameFemale[LOCALE_enUS] : title->nameMale[LOCALE_enUS]);
            auto placeholder = name.find("%s");
            if (placeholder != std::string::npos)
                name.replace(placeholder, 2, player->GetName());
            data["reward_text"].push_back("Title: " + name);
        }
        for (uint8 i = 0; i < QUEST_OBJECTIVES_COUNT; ++i)
            if (quest->RequiredNpcOrGo[i])
            {
                auto text = quest->ObjectiveText[i];
                if (text.empty())
                {
                    auto entry = quest->RequiredNpcOrGo[i];
                    if (entry > 0)
                    {
                        if (auto creature = sObjectMgr->GetCreatureTemplate(entry))
                            text = creature->Name;
                    }
                    else if (auto object = sObjectMgr->GetGameObjectTemplate(-int64(entry)))
                        text = object->name;
                }
                data["objectives"].push_back({{"text", text.empty() ? "Objective" : text},
                    {"value", player->GetQuestSlotCounter(slot, i)}, {"max", quest->RequiredNpcOrGoCount[i]}});
            }
        for (uint8 i = 0; i < QUEST_ITEM_OBJECTIVES_COUNT; ++i)
            if (quest->RequiredItemId[i])
            {
                auto item = sObjectMgr->GetItemTemplate(quest->RequiredItemId[i]);
                data["objectives"].push_back({{"text", item ? item->Name1 : "Required item"},
                    {"value", progress ? progress->ItemCount[i] : 0},
                    {"max", quest->RequiredItemCount[i]}});
            }
        if (quest->GetPlayersSlain())
            data["objectives"].push_back({{"text", "Players slain"},
                {"value", progress ? progress->PlayerCount : 0}, {"max", quest->GetPlayersSlain()}});
        if (quest->HasSpecialFlag(QUEST_SPECIAL_FLAGS_EXPLORATION_OR_EVENT))
            data["objectives"].push_back({{"text", quest->GetAreaDescription().empty() ?
                "Exploration or event" : quest->GetAreaDescription()},
                {"value", progress && progress->Explored ? 1 : 0}, {"max", 1}});
        if (quest->GetRewOrReqMoney() < 0)
            data["objectives"].push_back({{"text", "Required money (copper)"}, {"value", player->GetMoney()},
                {"max", -int64(quest->GetRewOrReqMoney())}});
        for (auto const& [faction, target] : std::array<std::pair<uint32, int32>, 2>{
            {{quest->GetRepObjectiveFaction(), quest->GetRepObjectiveValue()},
            {quest->GetRepObjectiveFaction2(), quest->GetRepObjectiveValue2()}}})
            if (faction)
            {
                auto entry = sFactionStore.LookupEntry(faction);
                data["objectives"].push_back({{"text", entry ? Name(entry->name[LOCALE_enUS]) : "Reputation"},
                    {"value", player->GetReputationMgr().GetReputation(faction)}, {"max", std::max(0, target)}});
            }
        for (uint8 i = 0; i < QUEST_REWARDS_COUNT; ++i)
            if (auto item = sObjectMgr->GetItemTemplate(quest->RewardItemId[i]))
                data["rewards"].push_back({{"item", ItemData(item, nullptr, quest->RewardItemIdCount[i])},
                    {"choice", false}});
        for (uint8 i = 0; i < QUEST_REWARD_CHOICES_COUNT; ++i)
            if (auto item = sObjectMgr->GetItemTemplate(quest->RewardChoiceItemId[i]))
                data["rewards"].push_back({{"item", ItemData(item, nullptr, quest->RewardChoiceItemCount[i])},
                    {"choice", true}});
        quests.push_back(std::move(data));
    }
    return {{"quests", std::move(quests)}};
}

Json Projection::Inventory(Player* player) const
{
    auto containers = Json::array();
    auto add = [&](std::string id, std::string name, char const* kind, uint8 bag, uint16 first, uint16 last,
        bool available = true)
    {
        auto slots = ProjectSlots(first, last, [&](uint16 slot)
        {
            auto item = player->GetItemByPos(bag, slot);
            return item ? ItemData(item->GetTemplate(), item) : Json(nullptr);
        });
        containers.push_back({{"id", id}, {"name", name}, {"kind", kind}, {"capacity", last - first},
            {"available", available}, {"slots", std::move(slots)}});
    };
    add("backpack", "Backpack", "carried", INVENTORY_SLOT_BAG_0, INVENTORY_SLOT_ITEM_START, INVENTORY_SLOT_ITEM_END);
    add("bank", "Bank", "bank", INVENTORY_SLOT_BAG_0, BANK_SLOT_ITEM_START, BANK_SLOT_ITEM_END);
    add("keyring", "Keyring", "keyring", INVENTORY_SLOT_BAG_0, KEYRING_SLOT_START, KEYRING_SLOT_END);
    add("currency", "Currency", "currency", INVENTORY_SLOT_BAG_0, CURRENCYTOKEN_SLOT_START, CURRENCYTOKEN_SLOT_END);
    for (auto const& [first, last] : std::array<std::pair<uint8, uint8>, 2>{
        {{INVENTORY_SLOT_BAG_START, INVENTORY_SLOT_BAG_END}, {BANK_SLOT_BAG_START, BANK_SLOT_BAG_END}}})
        for (uint8 slot = first; slot < last; ++slot)
        {
            bool bank = first == BANK_SLOT_BAG_START;
            auto item = player->GetItemByPos(INVENTORY_SLOT_BAG_0, slot);
            auto bag = item ? item->ToBag() : nullptr;
            add("bag-" + std::to_string(slot), item ? item->GetTemplate()->Name1 : "Empty bag slot",
                bank ? "bank" : "carried", slot, 0, bag ? bag->GetBagSize() : 0,
                !bank || slot - BANK_SLOT_BAG_START < player->GetBankBagSlotCount());
        }
    return {{"money", player->GetMoney()}, {"honor", player->GetHonorPoints()}, {"arena", player->GetArenaPoints()},
        {"containers", std::move(containers)}};
}

std::map<std::string, Json> Projection::Capture(Player* player, bool achievements) const
{
    std::map<std::string, Json> panels{{"info", Info(player)}, {"reputation", Reputations(player)},
        {"skills", Skills(player)}, {"talents", Talents(player)}, {"quests", Quests(player)},
        {"inventory", Inventory(player)}};
    if (achievements)
        panels.emplace("achievements", Achievements(player));
    return panels;
}
}
