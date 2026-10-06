// SPDX-License-Identifier: GPL-2.0-or-later
#ifndef MOD_CHAR_WIDGET_METADATA_H
#define MOD_CHAR_WIDGET_METADATA_H

#include "CharWidgetState.h"
#include <filesystem>

namespace CharWidget
{
// Minimal checked WDBC reader for supplemental display fields omitted by the core's DBC stores.
class DbcTable
{
public:
    bool Load(std::filesystem::path const& path, std::uint32_t fields);
    std::uint32_t Number(std::uint32_t id, std::uint32_t field) const;
    std::string Text(std::uint32_t id, std::uint32_t field) const;

private:
    std::vector<unsigned char> _bytes;
    std::unordered_map<std::uint32_t, std::size_t> _rows;
    std::size_t _strings = 0;
    std::uint32_t _fields = 0;
};

class Metadata
{
public:
    void Load(std::filesystem::path const& dbcPath);
    std::string Text(std::string const& table, std::uint32_t id, std::uint32_t field,
        std::string fallback = {}) const;
    std::uint32_t Number(std::string const& table, std::uint32_t id, std::uint32_t field) const;
    std::string Icon(std::uint32_t id) const;

private:
    std::unordered_map<std::string, DbcTable> _tables;
};
}

#endif
