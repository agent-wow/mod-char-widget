// SPDX-License-Identifier: GPL-2.0-or-later
#include "CharWidgetMetadata.h"
#include <gtest/gtest.h>
#include <fstream>

namespace
{
using namespace CharWidget;

TEST(CharWidgetMetadata, ValidatesLayoutAndBoundsWithoutUsingUncheckedClientPointers)
{
    auto path = std::filesystem::temp_directory_path() /
        ("char-widget-dbc-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    struct Cleanup
    {
        std::filesystem::path Path;
        ~Cleanup() { std::error_code error; std::filesystem::remove(Path, error); }
    } cleanup{path};
    std::vector<unsigned char> bytes;
    auto append = [&bytes](std::uint32_t value)
    {
        for (unsigned i = 0; i < 4; ++i)
            bytes.push_back((value >> (i * 8)) & 255);
    };
    for (auto value : {0x43424457u, 1u, 3u, 12u, 7u, 42u, 1u, 999u})
        append(value);
    for (auto value : {'\0', 'H', 'e', 'l', 'l', 'o', '\0'})
        bytes.push_back(value);
    auto write = [&]
    {
        std::ofstream file(path, std::ios::binary);
        file.write(reinterpret_cast<char const*>(bytes.data()), bytes.size());
    };
    write();
    DbcTable table;
    ASSERT_TRUE(table.Load(path, 3));
    EXPECT_EQ(table.Text(42, 1), "Hello");
    EXPECT_EQ(table.Number(42, 2), 999);
    EXPECT_TRUE(table.Text(42, 2).empty());
    EXPECT_TRUE(table.Text(43, 1).empty());
    EXPECT_FALSE(table.Load(path, 2));
    EXPECT_TRUE(table.Text(42, 1).empty());
    bytes.pop_back();
    write();
    EXPECT_FALSE(table.Load(path, 3));
}
}
