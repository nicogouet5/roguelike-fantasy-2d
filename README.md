# DinoLike: Reino Jurásico

Action roguelite **2D isométrico en pixel art** hecho con **TypeScript (strict)**, **Vite**, **Phaser 4.2.1**, **Zod** y **Web Audio API**.

Cada especie de dinosaurio es una clase jugable con su arma icónica en fauces o garras:

- **T-Rex** (*Espadón Gigante*) — Coloso de daño bruto, tajos amplios y salto aplastante estilo DinoBlade.
- **Velociraptor** (*Katanas Dobles*) — DPS glass cannon ultrarrápido con dash cortante y críticos ×2.
- **Triceratops** (*Escudo Óseo y Lanza*) — Tanque herbívoro acorazado con embestida y pisotón sísmico.
- **Dodo Mago** (*Gorrito de Mago + Báculo de Ámbar*) — Mago elemental primordial con magma, rayo jurásico y lluvia de meteoritos.
- **Pteranodon** (*Arco de Hueso*) — Arquero ágil a distancia con flechas perforantes y lluvia de espinas.

## Controles

| Tecla / Entrada | Acción |
|---|---|
| `W / A / S / D` o Flechas (o Joystick táctil) | Mover dinosaurio en terreno isométrico |
| Automático / Click izquierdo | Ataque básico automático al enemigo cercano o habilidad hacia el cursor |
| `1 / 2 / 3` | Lanzar habilidades activas de la clase hacia el cursor |
| `Q` | Beber Poción de Ámbar (recupera HP y SP) |
| `C` | Abrir / cerrar panel de Estadísticas y Reliquias (pausa el juego) |
| `R` | Activar / desactivar Auto-Cast de habilidades |
| `M` | Silenciar / activar audio procedural |
| `Esc` | Menú de pausa / volver al título |

## Comandos

```bash
npm install
npm run dev
npm test
npm run build
npm run lint
npm run sim -- --runs 50 --seed 42
```

## Documentación

- [`docs/SPEC.md`](./docs/SPEC.md) — Especificación completa reformulada
- [`docs/MVP.md`](./docs/MVP.md) — Alcance del primer MVP
