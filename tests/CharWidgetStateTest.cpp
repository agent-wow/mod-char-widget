// SPDX-License-Identifier: GPL-2.0-or-later
#include "CharWidgetState.h"
#include <gtest/gtest.h>

namespace
{
using namespace CharWidget;
using namespace std::chrono_literals;

Snapshot Make(std::string key, std::uint64_t sequence, Time now = {})
{
    return {key, sequence, now, {{"guid", "Alice"}, {"panel", key}, {"data", Json::object()}}};
}

TEST(CharWidgetState, ReputationRankBoundariesAndNegativeStandings)
{
    std::array<int, 8> const starts{-42000, -6000, -3000, 0, 3000, 9000, 21000, 42000};
    for (std::size_t rank = 0; rank < starts.size(); ++rank)
    {
        auto data = ReputationProgress(starts[rank]);
        EXPECT_EQ(data["rank"], rank);
        EXPECT_EQ(data["value"], 0);
        EXPECT_GT(data["max"].get<int>(), 0);
        if (rank)
            EXPECT_EQ(ReputationProgress(starts[rank] - 1)["rank"], rank - 1);
    }
    EXPECT_EQ(ReputationProgress(50000)["value"], 999);
    EXPECT_EQ(ReputationProgress(-50000)["standing"], -42000);
}

TEST(CharWidgetState, TalentHighestRankIsIndependentForEachSpecialization)
{
    std::array<std::uint32_t, 5> spells{10, 11, 12, 0, 0};
    EXPECT_EQ(LearnedRank(spells, [](auto id) { return id == 12; }), 3);
    EXPECT_EQ(LearnedRank(spells, [](auto id) { return id == 10; }), 1);
    EXPECT_EQ(LearnedRank(spells, [](auto) { return false; }), 0);
    EXPECT_EQ(LearnedRank(spells, [](auto) { return true; }), 3);
}

TEST(CharWidgetState, InventoryPreservesAbsoluteSlotsAndEmptyHoles)
{
    auto slots = ProjectSlots(39, 42, [](auto slot) { return slot == 40 ? Json{{"id", 123}} : Json(nullptr); });
    ASSERT_EQ(slots.size(), 3);
    EXPECT_EQ(slots[0]["slot"], 39);
    EXPECT_TRUE(slots[0]["item"].is_null());
    EXPECT_EQ(slots[1]["item"]["id"], 123);
    EXPECT_EQ(slots[2]["slot"], 41);
    EXPECT_TRUE(ProjectSlots(0, 0, [](auto) { return Json(nullptr); }).empty());
}

TEST(CharWidgetState, CoalescesByPanelWithoutStarvationAndPreservesNewerUpdatesOnRetry)
{
    SnapshotQueue queue;
    queue.Push(Make("Alice/info", 1));
    queue.Push(Make("Alice/inventory", 2));
    queue.Push(Make("Alice/info", 3));
    auto flight = queue.Take(Time{}, 1);
    ASSERT_EQ(flight.size(), 1);
    EXPECT_EQ(flight[0].Sequence, 3);
    queue.Push(Make("Alice/info", 4));
    queue.Retry(std::move(flight), Time{} + 1s);
    auto next = queue.Take(Time{} + 1s);
    ASSERT_EQ(next.size(), 2);
    EXPECT_EQ(next[0].Key, "Alice/inventory");
    EXPECT_EQ(next[1].Sequence, 4);
    queue.Retry(std::move(next), Time{} + 15s);
    EXPECT_EQ(queue.Size(), 0);
}

TEST(CharWidgetState, SizeAndCountLimitsRejectNewStateWithoutDestroyingPendingData)
{
    SnapshotQueue queue(4096, 1);
    EXPECT_TRUE(queue.Push(Make("Alice/info", 1)));
    EXPECT_FALSE(queue.Push(Make("Bob/info", 2)));
    auto large = Make("Alice/info", 3);
    large.Data["data"] = std::string(5000, 'x');
    EXPECT_FALSE(queue.Push(std::move(large)));
    EXPECT_EQ(queue.Take(Time{})[0].Sequence, 1);
    EXPECT_TRUE(Retryable(0));
    EXPECT_TRUE(Retryable(429));
    EXPECT_TRUE(Retryable(503));
    EXPECT_FALSE(Retryable(401));
}

TEST(CharWidgetState, AchievementCompletionAndCountersSurviveSerializationAndQueueAging)
{
    auto snapshot = Make("Alice/achievements", 18446744073709551615ull);
    snapshot.Data["data"] = {{"earned", {{{"id", 1}, {"date", 1700000000}}}},
        {"progress", {{{"id", 2}, {"counter", 4294967295u}, {"date", 1700000001}}}}};
    auto batch = Batch("realm", "process", {snapshot}, Time{} + 1200ms);
    EXPECT_EQ(batch["updates"][0]["sequence"], "18446744073709551615");
    EXPECT_EQ(batch["updates"][0]["age_ms"], 1200);
    EXPECT_EQ(batch["updates"][0]["data"]["earned"][0]["id"], 1);
    EXPECT_EQ(batch["updates"][0]["data"]["progress"][0]["counter"], 4294967295u);
}

TEST(CharWidgetState, CatalogueChunksRetainAllRecordsWithinBoundedEnvelopes)
{
    auto entries = Json::array();
    for (int i = 0; i < 6000; ++i)
        entries.push_back({{"id", i}, {"name", std::string(300, 'x')}});
    auto chunks = CatalogChunks(entries, "realm", "process", "revision");
    EXPECT_GT(chunks.size(), 1);
    std::size_t count = 0;
    for (std::size_t i = 0; i < chunks.size(); ++i)
    {
        EXPECT_EQ(chunks[i]["chunk_index"], i);
        EXPECT_EQ(chunks[i]["chunk_count"], chunks.size());
        EXPECT_LT(chunks[i].dump().size(), 1024 * 1024 + 1024);
        count += chunks[i]["entries"].size();
    }
    EXPECT_EQ(count, 6000);
    EXPECT_EQ(IconName("Interface\\Icons\\INV_Staff_13.blp"), "inv_staff_13");
    EXPECT_TRUE(IconName("bad?icon").empty());
}
}
