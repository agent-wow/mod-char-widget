// SPDX-License-Identifier: GPL-2.0-or-later
#include "CharWidgetMetadata.h"
#include "Log.h"
#include <algorithm>
#include <fstream>
#include <iterator>

namespace CharWidget
{
namespace
{
std::uint32_t Read32(std::vector<unsigned char> const& bytes, std::size_t at)
{
    return std::uint32_t(bytes[at]) | (std::uint32_t(bytes[at + 1]) << 8) |
        (std::uint32_t(bytes[at + 2]) << 16) | (std::uint32_t(bytes[at + 3]) << 24);
}
}

bool DbcTable::Load(std::filesystem::path const& path, std::uint32_t fields)
{
    _rows.clear();
    _bytes.clear();
    std::error_code error;
    auto size = std::filesystem::file_size(path, error);
    if (error || size < 20 || size > 64 * 1024 * 1024 || !fields || fields > 256)
        return false;
    std::ifstream file(path, std::ios::binary);
    std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    if (bytes.size() != size || Read32(bytes, 0) != 0x43424457 || Read32(bytes, 8) != fields ||
        Read32(bytes, 12) != fields * 4)
        return false;
    auto rows = Read32(bytes, 4);
    auto strings = std::uint64_t(20) + std::uint64_t(rows) * fields * 4;
    if (strings + Read32(bytes, 16) != size || !Read32(bytes, 16) || bytes.back() != 0)
        return false;
    _bytes = std::move(bytes);
    _fields = fields;
    _strings = strings;
    for (std::size_t i = 0; i < rows; ++i)
    {
        auto offset = 20 + i * fields * 4;
        if (!_rows.emplace(Read32(_bytes, offset), offset).second)
        {
            _rows.clear();
            _bytes.clear();
            return false;
        }
    }
    return true;
}

std::uint32_t DbcTable::Number(std::uint32_t id, std::uint32_t field) const
{
    auto row = _rows.find(id);
    return row == _rows.end() || field >= _fields ? 0 : Read32(_bytes, row->second + field * 4);
}

std::string DbcTable::Text(std::uint32_t id, std::uint32_t field) const
{
    if (!_rows.contains(id) || field >= _fields)
        return {};
    auto offset = Number(id, field);
    if (offset >= _bytes.size() - _strings)
        return {};
    auto start = _bytes.begin() + _strings + offset;
    auto end = std::find(start, _bytes.end(), 0);
    if (end == _bytes.end() || end - start > 16384)
        return {};
    return std::string(start, end);
}

void Metadata::Load(std::filesystem::path const& dbcPath)
{
    for (auto const& [name, fields] : std::vector<std::pair<std::string, std::uint32_t>>{
        {"Achievement", 62}, {"Achievement_Category", 20}, {"Achievement_Criteria", 31},
        {"TalentTab", 24}, {"SpellIcon", 2}, {"QuestSort", 18}})
        if (!_tables[name].Load(dbcPath / (name + ".dbc"), fields))
            LOG_WARN("module.charwidget", "Supplemental {}.dbc unavailable; using display fallbacks", name);
}

std::string Metadata::Text(std::string const& table, std::uint32_t id, std::uint32_t field,
    std::string fallback) const
{
    auto found = _tables.find(table);
    auto value = found == _tables.end() ? std::string{} : found->second.Text(id, field);
    return value.empty() ? fallback : value;
}

std::uint32_t Metadata::Number(std::string const& table, std::uint32_t id, std::uint32_t field) const
{
    auto found = _tables.find(table);
    return found == _tables.end() ? 0 : found->second.Number(id, field);
}

std::string Metadata::Icon(std::uint32_t id) const
{
    return IconName(Text("SpellIcon", id, 1));
}
}
