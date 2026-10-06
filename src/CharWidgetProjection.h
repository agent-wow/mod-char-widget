// SPDX-License-Identifier: GPL-2.0-or-later
#ifndef MOD_CHAR_WIDGET_PROJECTION_H
#define MOD_CHAR_WIDGET_PROJECTION_H

#include "CharWidgetMetadata.h"
#include <map>

class Player;
class Item;
struct ItemTemplate;

namespace CharWidget
{
class Projection
{
public:
    explicit Projection(Metadata const& metadata) : _metadata(metadata) { }
    Json Catalog() const;
    std::map<std::string, Json> Capture(Player* player, bool achievements) const;

private:
    Json ItemData(ItemTemplate const* item, Item const* instance = nullptr, std::uint32_t count = 1) const;
    Json Info(Player* player) const;
    Json Reputations(Player* player) const;
    Json Skills(Player* player) const;
    Json Talents(Player* player) const;
    Json Achievements(Player* player) const;
    Json Quests(Player* player) const;
    Json Inventory(Player* player) const;
    Metadata const& _metadata;
};
}

#endif
