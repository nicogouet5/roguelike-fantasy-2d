# Escenarios de Falla 23

Los originales de `Concept Art/Escenario` son referencia visual. Los PNG de esta
carpeta no se cargan como fondos en el juego. La cuadrícula de
`src/core/scenarioLayouts.ts` define el piso, el vacío, las paredes y los portales;
`src/game/mapRenderer.ts` la dibuja con losetas y ruinas isométricas
(`src/game/arenaArchitecture.ts`). El orden y los datos de cada piso viven en
`src/data/maps.json`; los nombres, en `src/data/names.es.json`.
La partida avanza automáticamente al completar las oleadas de cada zona.

| Piso | Mapa (`id`) | Mockup | Zona jugable |
| --- | --- | --- | --- |
| 1 | `valle_helechos` | `Falla_23_Claustro_Mineral_Mockup.png` | Claustro Mineral: patio y galerías perimetrales. |
| 2 | `crater_obsidiana` | `Falla_23_Puente_Quebrado_Mockup.png` | Puente Quebrado: tablero sobre un abismo, con dos plataformas y pilares. |
| 3 | `fortaleza_falla_23` | `Falla_23_Arena_Isometrica_Mockup.png` | Fortaleza Falla 23: plaza amurallada con el arco numerado. |
| 4 | `canon_dinoblade` | `Falla_23_Osario_Hundido_Mockup.png` | Osario Hundido: arena octogonal final del Espinosaurio. |

## Reglas de los layouts

- Los tres primeros pisos son losas grises abiertas, sin franja de «camino»; el
  render propio está en `src/game/scenarioRenderer.ts` y `src/game/scenarioArt.ts`.
- `ground` y `portal` son transitables; `wall` y `void` bloquean a jugador, mobs y
  proyectiles. `void` es la caída que muestra cada mockup: foso de agua (Claustro),
  abismo de lava (Puente) y lava bajo los acantilados (Fortaleza).
- Ninguna casilla transitable toca el límite del mapa.
- El spawn tiene un área libre de 3×3 y siempre conecta con el portal: a la derecha
  en Claustro y Puente, y en el portón «23» del muro trasero en la Fortaleza. En el
  Osario también conecta con el centro donde nace el jefe.
- El decorado (arcos, cristales, braseros, banderas, calavera, puesto, cadenas) es
  solo visual y no bloquea.
- `tests/scenarios.test.ts` y `tests/core.test.ts` verifican estas reglas.

## Acceso desde el menú Devs

El panel «Devs · Test» (en partida) permite saltar a cualquier piso con
«Ir a stage» sin perder nivel ni build; usa `enterZone` en `src/core/engine.ts`.
