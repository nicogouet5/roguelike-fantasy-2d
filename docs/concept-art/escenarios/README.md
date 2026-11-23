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
| 1 | `valle_helechos` (64×64) | `Falla_23_Claustro_Mineral_Mockup.png` | Claustro Mineral, dominante jade y ámbar: isla central rodeada por un foso, cuatro calzadas que la unen a la galería perimetral de adoquín ámbar y cuatro patios con estanque en las esquinas. |
| 2 | `crater_obsidiana` (80×56) | `Falla_23_Puente_Quebrado_Mockup.png` | Puente Quebrado, dominante violeta y cobre: cubierta de piedra con plaza central entre dos fortines, y dos pasarelas de tablones que la bordean y se unen mediante conectores, sobre un abismo de lava. |
| 3 | `fortaleza_falla_23` (64×64) | `Falla_23_Arena_Isometrica_Mockup.png` | Fortaleza Falla 23, dominante azul acero y coral: camino procesional coral desde el antepatio sur, por la gran plaza, hasta el portón «23»; un camino cruzado enlaza los patios oeste y este, con lagos de lava al norte. |
| 4 | `canon_dinoblade` | `Falla_23_Osario_Hundido_Mockup.png` | Osario Hundido: arena octogonal final del Espinosaurio. |

## Texturas extraídas de las imágenes

`src/assets/scenario-surfaces/` contiene cuatro atlas de losetas (16 variantes de
piedra y 16 de ruta por escenario). Se toman muestras de los pisos de los mockups,
sin personajes ni arquitectura de fondo. El render aplica sombra cerca de los
bordes y un rebote cálido en los escenarios de lava sin cambiar las colisiones.
Para regenerarlas: `python3 scripts/bake-scenario-surfaces.py '/ruta/a/Escenario'`.

## Reglas de los layouts

- Cada piso mezcla losas (`ground`) con rutas (`path`) de otro material: adoquín ámbar,
  tablones violeta-marrón o adoquín coral. La geometría vive en
  `src/core/scenarioLayouts.ts`; el render y la paleta de cada nivel, en
  `src/game/scenarioRenderer.ts` y `src/game/scenarioArt.ts`.
- `ground`, `path` y `portal` son transitables; `wall` y `void` bloquean a jugador, mobs y
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
