/**
 * Pixel-art boon icon URLs.  This module deliberately has no game or DOM
 * dependency so HUD code can render the same authored asset in any surface.
 */
import amberResonance from './ui/boons/boon_amber_resonance.svg';
import amberVeins from './ui/boons/boon_amber_veins.svg';
import bloodFrenzy from './ui/boons/boon_blood_frenzy.svg';
import butcherPact from './ui/boons/boon_butcher_pact.svg';
import capBerserkFury from './ui/boons/boon_cap_berserk_fury.svg';
import capBloodHarvest from './ui/boons/boon_cap_blood_harvest.svg';
import capCritStorm from './ui/boons/boon_cap_crit_storm.svg';
import capTitanHeart from './ui/boons/boon_cap_titan_heart.svg';
import capVolcanicCore from './ui/boons/boon_cap_volcanic_core.svg';
import dodoCataclysm from './ui/boons/boon_dodo_cataclysm.svg';
import immovableColossus from './ui/boons/boon_immovable_colossus.svg';
import keenFangs from './ui/boons/boon_keen_fangs.svg';
import obsidianEdge from './ui/boons/boon_obsidian_edge.svg';
import pteraGaleQuiver from './ui/boons/boon_ptera_gale_quiver.svg';
import primalMight from './ui/boons/boon_primal_might.svg';
import projectileOverload from './ui/boons/boon_projectile_overload.svg';
import raptorPhantomEdge from './ui/boons/boon_raptor_phantom_edge.svg';
import raptorReflex from './ui/boons/boon_raptor_reflex.svg';
import relicAbyssalClaw from './ui/boons/boon_relic_abyssal_claw.svg';
import relicRaptorPlume from './ui/boons/boon_relic_raptor_plume.svg';
import relicRexFang from './ui/boons/boon_relic_rex_fang.svg';
import relicTrikePlate from './ui/boons/boon_relic_trike_plate.svg';
import relicVolcanicAmber from './ui/boons/boon_relic_volcanic_amber.svg';
import saurianCarapace from './ui/boons/boon_saurian_carapace.svg';
import serratedClaws from './ui/boons/boon_serrated_claws.svg';
import statAgi from './ui/boons/boon_stat_agi.svg';
import statDex from './ui/boons/boon_stat_dex.svg';
import statInt from './ui/boons/boon_stat_int.svg';
import statLuk from './ui/boons/boon_stat_luk.svg';
import statStr from './ui/boons/boon_stat_str.svg';
import statVit from './ui/boons/boon_stat_vit.svg';
import titanBlade from './ui/boons/boon_rex_titan_blade.svg';
import trikeFortress from './ui/boons/boon_trike_fortress.svg';
import trikeLongHorns from './ui/boons/boon_trike_long_horns.svg';
import unknownBoon from './ui/boons/boon_unknown.svg';

export const BOON_ICON_URLS: Readonly<Record<string, string>> = Object.freeze({
  boon_stat_str: statStr,
  boon_stat_agi: statAgi,
  boon_stat_vit: statVit,
  boon_stat_int: statInt,
  boon_stat_dex: statDex,
  boon_stat_luk: statLuk,
  boon_primal_might: primalMight,
  boon_raptor_reflex: raptorReflex,
  boon_saurian_carapace: saurianCarapace,
  boon_amber_veins: amberVeins,
  boon_serrated_claws: serratedClaws,
  boon_keen_fangs: keenFangs,
  boon_blood_frenzy: bloodFrenzy,
  boon_butcher_pact: butcherPact,
  boon_immovable_colossus: immovableColossus,
  boon_projectile_overload: projectileOverload,
  boon_obsidian_edge: obsidianEdge,
  boon_amber_resonance: amberResonance,
  boon_rex_titan_blade: titanBlade,
  boon_raptor_phantom_edge: raptorPhantomEdge,
  boon_trike_fortress: trikeFortress,
  boon_trike_long_horns: trikeLongHorns,
  boon_dodo_cataclysm: dodoCataclysm,
  boon_ptera_gale_quiver: pteraGaleQuiver,
  boon_cap_crit_trex: titanBlade,
  boon_cap_crit_raptor: raptorPhantomEdge,
  boon_cap_crit_trike: capTitanHeart,
  boon_cap_crit_dodo: capCritStorm,
  boon_cap_crit_ptera: pteraGaleQuiver,
  boon_cap_blood_harvest: capBloodHarvest,
  boon_cap_titan_heart: capTitanHeart,
  boon_cap_volcanic_core: capVolcanicCore,
  boon_cap_berserk_fury: capBerserkFury,
  boon_relic_rex_fang: relicRexFang,
  boon_relic_raptor_plume: relicRaptorPlume,
  boon_relic_trike_plate: relicTrikePlate,
  boon_relic_volcanic_amber: relicVolcanicAmber,
  boon_relic_abyssal_claw: relicAbyssalClaw,
});

/** Returns an image-ready URL for every known boon, and a neutral safe glyph for unknown IDs. */
export function getBoonIconUrl(boonId: string): string {
  return BOON_ICON_URLS[boonId] ?? unknownBoon;
}
