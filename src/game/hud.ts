import { getDinoPreviewDataUrl, getDinoPreviewFrames } from '../assets/pixelArt.ts';
import type { GameData } from '../core/data.ts';
import { computeDerivedStats } from '../core/stats.ts';
import type { GameState, StatKey } from '../core/types.ts';

export interface HudCallbacks {
  onStartRun: (classId: string, seed: string, autoCast: boolean) => void;
  onSkillSlot: (index: number) => void;
  onUsePotion: () => void;
  onToggleAutoAttack: () => void;
  onToggleAutoCast: () => void;
  onToggleMute: () => void;
  onAllocateStat: (stat: StatKey) => void;
  onPickBoon: (boonId: string) => void;
  onRerollOffer: () => void;
  onSkipOffer: () => void;
  onSetPaused: (paused: boolean) => void;
  onReturnToTitle: () => void;
  onJoystickMove: (sx: number, sy: number) => void;
}

const STAT_KEYS: StatKey[] = ['STR', 'AGI', 'VIT', 'INT', 'DEX', 'LUK'];

export class GameHud {
  private selectedClassId: string;
  private seed = 'dinoblade-2026';
  private autoCastStart = false;
  private statsOpen = false;
  private escOpen = false;
  private muted = false;
  private lastOfferKey = '';
  private lastStatus = '';
  private lastState: GameState | null = null;
  private lastSyncMs = 0;
  private previewAnimTimer: number | null = null;
  private previewAnimFrame = 0;

  private titleEl!: HTMLDivElement;
  private hudLayer!: HTMLDivElement;
  private statusCard!: HTMLDivElement;
  private bossBarEl!: HTMLDivElement;
  private minimapWrap!: HTMLDivElement;
  private minimapCanvas!: HTMLCanvasElement;
  private zoneLabelEl!: HTMLDivElement;
  private goalLabelEl!: HTMLDivElement;
  private hotbarEl!: HTMLDivElement;
  private expBarFill!: HTMLDivElement;
  private offerModal!: HTMLDivElement;
  private statsDrawer!: HTMLDivElement;
  private escModal!: HTMLDivElement;
  private summaryModal!: HTMLDivElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly data: GameData,
    private readonly cb: HudCallbacks
  ) {
    this.selectedClassId = data.classes[0]!.id;
    this.buildDom();
    this.showTitle();
  }

  private buildDom(): void {
    this.root.innerHTML = '';

    // 1. Title Screen
    this.titleEl = document.createElement('div');
    this.titleEl.id = 'title-overlay';
    this.root.appendChild(this.titleEl);
    this.renderTitle();

    // 2. Active HUD layer
    this.hudLayer = document.createElement('div');
    this.hudLayer.id = 'hud-layer';
    this.hudLayer.style.display = 'none';
    this.root.appendChild(this.hudLayer);

    this.statusCard = document.createElement('div');
    this.statusCard.id = 'status-card';
    this.hudLayer.appendChild(this.statusCard);

    this.bossBarEl = document.createElement('div');
    this.bossBarEl.id = 'boss-bar';
    this.bossBarEl.style.display = 'none';
    this.hudLayer.appendChild(this.bossBarEl);

    this.minimapWrap = document.createElement('div');
    this.minimapWrap.id = 'minimap-card';
    this.minimapWrap.innerHTML = `
      <canvas id="minimap-canvas" width="124" height="124"></canvas>
      <div id="zone-name"></div>
      <div id="zone-goal"></div>
      <button class="mini-btn" id="btn-esc-menu">Menú [Esc]</button>
    `;
    this.hudLayer.appendChild(this.minimapWrap);
    this.minimapCanvas = this.minimapWrap.querySelector('#minimap-canvas') as HTMLCanvasElement;
    this.zoneLabelEl = this.minimapWrap.querySelector('#zone-name') as HTMLDivElement;
    this.goalLabelEl = this.minimapWrap.querySelector('#zone-goal') as HTMLDivElement;
    this.minimapWrap.querySelector('#btn-esc-menu')!.addEventListener('click', () => this.toggleEscMenu());

    this.hotbarEl = document.createElement('div');
    this.hotbarEl.id = 'hotbar';
    this.hudLayer.appendChild(this.hotbarEl);

    const expWrap = document.createElement('div');
    expWrap.id = 'exp-bar';
    this.expBarFill = document.createElement('div');
    this.expBarFill.id = 'exp-bar-fill';
    expWrap.appendChild(this.expBarFill);
    this.hudLayer.appendChild(expWrap);

    // Touch Joystick (mobile / touch)
    const joy = document.createElement('div');
    joy.id = 'touch-joystick';
    const knob = document.createElement('div');
    knob.id = 'touch-knob';
    joy.appendChild(knob);
    this.hudLayer.appendChild(joy);
    this.wireJoystick(joy, knob);

    // Modals
    this.offerModal = document.createElement('div');
    this.offerModal.id = 'offer-modal';
    this.offerModal.className = 'modal-backdrop';
    this.offerModal.style.display = 'none';
    this.root.appendChild(this.offerModal);

    this.statsDrawer = document.createElement('div');
    this.statsDrawer.id = 'stats-drawer';
    this.statsDrawer.style.display = 'none';
    this.root.appendChild(this.statsDrawer);

    this.escModal = document.createElement('div');
    this.escModal.id = 'esc-modal';
    this.escModal.className = 'modal-backdrop';
    this.escModal.style.display = 'none';
    this.root.appendChild(this.escModal);

    this.summaryModal = document.createElement('div');
    this.summaryModal.id = 'summary-modal';
    this.summaryModal.className = 'modal-backdrop';
    this.summaryModal.style.display = 'none';
    this.root.appendChild(this.summaryModal);
  }

  private wireJoystick(joy: HTMLElement, knob: HTMLElement): void {
    let activeId: number | null = null;
    const maxR = 36;
    const update = (clientX: number, clientY: number): void => {
      const rect = joy.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.cb.onJoystickMove(dx / maxR, dy / maxR);
    };
    joy.addEventListener('pointerdown', (e) => {
      activeId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      update(e.clientX, e.clientY);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      update(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      knob.style.transform = 'translate(0px, 0px)';
      this.cb.onJoystickMove(0, 0);
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
  }

  private renderTitle(): void {
    const selected = this.data.classesById[this.selectedClassId]!;
    const selectedInfo = this.data.names.classes[selected.id]!;
    const weaponName = this.data.names.weapons[selected.weaponType];
    const archName = this.data.names.archetypes[selected.archetype];

    const cardsHtml = this.data.classes
      .map((cls) => {
        const info = this.data.names.classes[cls.id]!;
        const active = cls.id === this.selectedClassId ? 'selected' : '';
        const frames = getDinoPreviewFrames(cls.spriteId);
        const preview = frames[this.previewAnimFrame % frames.length]!;
        return `
          <button class="dino-card ${active}" data-class="${cls.id}" style="--accent:${cls.accentColor}">
            <img class="pixel-sprite" data-preview-sprite="${cls.spriteId}" src="${preview}" alt="${info.name}" />
            <div class="dino-card-name">${info.name}</div>
            <div class="dino-card-weapon">${this.data.names.weapons[cls.weaponType]}</div>
          </button>
        `;
      })
      .join('');

    const skillChips = selected.activeSkillIds
      .map((sid, i) => {
        const sk = this.data.names.skills[sid]!;
        return `<div class="skill-chip"><span>[${i + 1}]</span> <strong>${sk.name}</strong> — ${sk.desc}</div>`;
      })
      .join('');

    const bar = (label: string, val: number, max: number, color: string): string => {
      const pct = Math.min(100, Math.round((val / max) * 100));
      return `
        <div class="stat-meter">
          <span>${label}</span>
          <div class="meter-track"><div class="meter-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
      `;
    };

    this.titleEl.innerHTML = `
      <div class="title-panel">
        <div class="title-header">
          <div class="title-badge">PIXEL ART · 2D ISOMÉTRICO</div>
          <h1>${this.data.names.ui.title}</h1>
          <p class="title-sub">Elige tu especie de dinosaurio y empuña tu arma contra el Spinosaurus Hoja-Abisal.</p>
        </div>

        <div class="dino-grid">${cardsHtml}</div>

        <div class="selected-detail" style="--accent:${selected.accentColor}">
          <div class="detail-left">
            <img class="pixel-sprite big-preview" data-preview-sprite="${selected.spriteId}" src="${getDinoPreviewFrames(selected.spriteId)[this.previewAnimFrame % 4]!}" alt="${selectedInfo.name}" />
            <div class="arch-pill">${archName}</div>
            <div class="weapon-pill">${weaponName}</div>
          </div>
          <div class="detail-right">
            <h2>${selectedInfo.name}</h2>
            <p>${selectedInfo.desc}</p>
            <div class="meters-grid">
              ${bar('VIDA', selected.baseHp, 300, '#22c55e')}
              ${bar('DAÑO', Math.max(selected.baseAtk, selected.baseMatk), 38, '#ef4444')}
              ${bar('VELOCIDAD', selected.baseMoveSpeed * 10, 55, '#38bdf8')}
              ${bar('DEFENSA', selected.baseDef, 60, '#f59e0b')}
            </div>
            <div class="skill-list">${skillChips}</div>
          </div>
        </div>

        <div class="title-controls">
          <label class="seed-label">
            Semilla
            <input id="seed-input" type="text" value="${this.seed}" />
          </label>
          <label class="toggle-label">
            <input id="autocast-check" type="checkbox" ${this.autoCastStart ? 'checked' : ''} />
            Auto-Cast habilidades
          </label>
          <button id="start-run-btn" class="primary-btn">⚔️ Iniciar Cacería</button>
        </div>
      </div>
    `;

    this.titleEl.querySelectorAll<HTMLButtonElement>('.dino-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedClassId = btn.dataset.class!;
        this.renderTitle();
      });
    });

    const seedInput = this.titleEl.querySelector('#seed-input') as HTMLInputElement;
    seedInput.addEventListener('input', () => {
      this.seed = seedInput.value.trim() || 'dinoblade-2026';
    });

    const autoCheck = this.titleEl.querySelector('#autocast-check') as HTMLInputElement;
    autoCheck.addEventListener('change', () => {
      this.autoCastStart = autoCheck.checked;
    });

    this.titleEl.querySelector('#start-run-btn')!.addEventListener('click', () => {
      this.cb.onStartRun(this.selectedClassId, this.seed, this.autoCastStart);
    });
  }

  showTitle(): void {
    this.statsOpen = false;
    this.escOpen = false;
    this.statsDrawer.style.display = 'none';
    this.escModal.style.display = 'none';
    this.offerModal.style.display = 'none';
    this.summaryModal.style.display = 'none';
    this.hudLayer.style.display = 'none';
    this.titleEl.style.display = 'flex';
    this.renderTitle();
    this.startPreviewAnim();
  }

  hideTitle(): void {
    this.stopPreviewAnim();
    this.titleEl.style.display = 'none';
    this.hudLayer.style.display = 'block';
    this.statsOpen = false;
    this.escOpen = false;
    this.lastOfferKey = '';
    this.lastStatus = '';
    this.statsDrawer.style.display = 'none';
    this.escModal.style.display = 'none';
    this.offerModal.style.display = 'none';
    this.summaryModal.style.display = 'none';
  }

  private startPreviewAnim(): void {
    if (this.previewAnimTimer !== null) return;
    this.previewAnimTimer = window.setInterval(() => {
      this.previewAnimFrame = (this.previewAnimFrame + 1) % 4;
      this.titleEl.querySelectorAll<HTMLImageElement>('img[data-preview-sprite]').forEach((img) => {
        const sid = img.dataset.previewSprite;
        if (!sid) return;
        const frames = getDinoPreviewFrames(sid);
        img.src = frames[this.previewAnimFrame % frames.length]!;
      });
    }, 185);
  }

  private stopPreviewAnim(): void {
    if (this.previewAnimTimer !== null) {
      window.clearInterval(this.previewAnimTimer);
      this.previewAnimTimer = null;
    }
  }

  setMuteState(muted: boolean): void {
    this.muted = muted;
    if (this.lastState) this.sync(this.lastState, true);
  }

  toggleStatsDrawer(): void {
    if (!this.lastState || this.lastState.pendingOffer || this.lastState.status !== 'playing') return;
    this.statsOpen = !this.statsOpen;
    this.escOpen = false;
    this.escModal.style.display = 'none';
    this.statsDrawer.style.display = this.statsOpen ? 'block' : 'none';
    this.cb.onSetPaused(this.statsOpen);
    if (this.statsOpen) this.renderStatsDrawer(this.lastState);
  }

  toggleEscMenu(): void {
    if (!this.lastState || this.lastState.pendingOffer || this.lastState.status !== 'playing') return;
    this.escOpen = !this.escOpen;
    this.statsOpen = false;
    this.statsDrawer.style.display = 'none';
    this.escModal.style.display = this.escOpen ? 'flex' : 'none';
    this.cb.onSetPaused(this.escOpen);
    if (this.escOpen) this.renderEscModal();
  }

  private renderEscModal(): void {
    this.escModal.innerHTML = `
      <div class="modal-card compact">
        <h2>Pausa</h2>
        <p class="muted">WASD/Flechas mover · 1/2/3 habilidades · Q poción · C estadísticas · R Auto-Cast</p>
        <div class="modal-actions-col">
          <button class="primary-btn" id="esc-resume">Continuar Cacería</button>
          <button class="secondary-btn" id="esc-restart">Reiniciar con este Dinosaurio</button>
          <button class="secondary-btn" id="esc-title">Cambiar Dinosaurio (Título)</button>
        </div>
      </div>
    `;
    this.escModal.querySelector('#esc-resume')!.addEventListener('click', () => this.toggleEscMenu());
    this.escModal.querySelector('#esc-restart')!.addEventListener('click', () => {
      if (this.lastState) {
        this.cb.onStartRun(this.lastState.player.classId, this.lastState.seed, this.lastState.player.autoCast);
      }
    });
    this.escModal.querySelector('#esc-title')!.addEventListener('click', () => this.cb.onReturnToTitle());
  }

  sync(state: GameState, force: boolean): void {
    this.lastState = state;
    const now = performance.now();
    if (!force && now - this.lastSyncMs < 75) return;
    this.lastSyncMs = now;

    const derived = computeDerivedStats(state, this.data);
    const player = state.player;
    const cls = this.data.classesById[player.classId]!;
    const clsName = this.data.names.classes[cls.id]!.name;
    const mapDef = this.data.mapsByFloor[state.floorIndex]!;

    // Status Card
    const hpPct = Math.round((player.hp / Math.max(1, derived.maxHp)) * 100);
    const spPct = Math.round((player.sp / Math.max(1, derived.maxSp)) * 100);
    const statBadge = player.statPoints > 0 ? `<span class="alert-pill">+${player.statPoints} Stats [C]</span>` : '';

    const buffLabels: Record<string, string> = {
      tyrant_fury: 'Furia Tirano',
      predator_instinct: 'Instinto',
      bone_aegis: 'Égida Ósea',
      sky_tailwind: 'Viento',
      codex_overclock: '>_ Boost',
      codex_shield: '>_ Escudo',
    };
    const activeBuffsHtml = player.buffs
      .filter((b) => b.remainingMs > 0 && buffLabels[b.id])
      .map(
        (b) =>
          `<span class="buff-chip ${b.id.startsWith('codex_') ? 'codex' : ''}">${buffLabels[b.id]} ${(b.remainingMs / 1000).toFixed(0)}s</span>`
      )
      .join('');
    const codexCd = Math.max(0, Math.ceil(state.pet.supportCooldownMs / 1000));

    this.statusCard.innerHTML = `
      <div class="hero-row">
        <div class="portrait-frame" style="border-color:${cls.accentColor}">
          <img class="pixel-sprite" src="${getDinoPreviewDataUrl(cls.spriteId)}" alt="${clsName}" />
        </div>
        <div class="hero-meta">
          <div class="hero-title-line">
            <strong>${clsName}</strong>
            <span>Nv ${player.level}</span>
            <span class="amber-tag">◆ ${player.amber}</span>
            ${statBadge}
          </div>
          <div class="bar-row hp"><div class="bar-fill" style="width:${hpPct}%"></div><span>HP ${Math.ceil(player.hp)} / ${derived.maxHp}</span></div>
          <div class="bar-row sp"><div class="bar-fill" style="width:${spPct}%"></div><span>SP ${Math.floor(player.sp)} / ${derived.maxSp}</span></div>
        </div>
      </div>
      <div class="pet-buff-row">
        <span class="pet-badge" title="Pet Codex flotante: te cura o te otorga buffs temporales automáticamente">
          <img class="pixel-sprite pet-icon" src="${getDinoPreviewDataUrl('pet_codex')}" alt="Codex" />
          Codex ${codexCd}s
        </span>
        ${activeBuffsHtml}
      </div>
      <div class="toggle-pills">
        <button class="pill ${player.autoAttack ? 'on' : ''}" id="pill-auto-atk">Auto-Atk</button>
        <button class="pill ${player.autoCast ? 'on' : ''}" id="pill-auto-cast">Auto-Cast [R]</button>
        <button class="pill" id="pill-stats">Stats [C]</button>
        <button class="pill ${!this.muted ? 'on' : ''}" id="pill-audio">${this.muted ? 'Sin Audio' : 'Audio [M]'}</button>
      </div>
    `;
    this.statusCard.querySelector('#pill-auto-atk')!.addEventListener('click', () => this.cb.onToggleAutoAttack());
    this.statusCard.querySelector('#pill-auto-cast')!.addEventListener('click', () => this.cb.onToggleAutoCast());
    this.statusCard.querySelector('#pill-stats')!.addEventListener('click', () => this.toggleStatsDrawer());
    this.statusCard.querySelector('#pill-audio')!.addEventListener('click', () => this.cb.onToggleMute());

    // Boss HP Bar
    const boss = state.mobs.find((m) => m.isBoss && m.hp > 0);
    if (boss) {
      const pct = Math.max(0, Math.round((boss.hp / boss.maxHp) * 100));
      this.bossBarEl.style.display = 'block';
      this.bossBarEl.innerHTML = `
        <div class="boss-title">
          <span>⚔️ ${this.data.names.mobs[boss.mobId]}</span>
          <span>${boss.bossPhase === 2 ? 'FASE 2 · FURIA ABISAL' : 'FASE 1'} · ${Math.ceil(boss.hp)}/${boss.maxHp}</span>
        </div>
        <div class="boss-track"><div class="boss-fill ${boss.bossPhase === 2 ? 'phase2' : ''}" style="width:${pct}%"></div></div>
      `;
    } else {
      this.bossBarEl.style.display = 'none';
    }

    // Minimap + Zone Info
    this.zoneLabelEl.textContent = `${state.floorIndex + 1}/3 · ${this.data.names.maps[mapDef.id]}`;
    if (mapDef.bossId) {
      this.goalLabelEl.textContent = boss ? 'Objetivo: Derrota al Jefe' : '¡Victoria!';
    } else if (state.portalUnlocked) {
      this.goalLabelEl.textContent = '★ ¡Portal Abierto! (Este)';
      this.goalLabelEl.style.color = '#38bdf8';
    } else {
      this.goalLabelEl.textContent = `Caza: ${state.zoneKills}/${mapDef.targetKills}`;
      this.goalLabelEl.style.color = '#fbbf24';
    }
    this.drawMinimap(state);

    // Hotbar
    const skillBtns = cls.activeSkillIds
      .map((sid, idx) => {
        const sk = this.data.skillsById[sid]!;
        const info = this.data.names.skills[sid]!;
        const cdMs = player.skillCooldowns[sid] ?? 0;
        const onCd = cdMs > 0;
        const noSp = player.sp < sk.spCost;
        return `
          <button class="slot-btn ${onCd || noSp ? 'dim' : ''}" data-slot="${idx}" title="${info.desc}">
            <span class="slot-key">${idx + 1}</span>
            <span class="slot-name">${info.name}</span>
            <span class="slot-meta">${onCd ? `${(cdMs / 1000).toFixed(1)}s` : `${sk.spCost} SP`}</span>
          </button>
        `;
      })
      .join('');

    this.hotbarEl.innerHTML = `
      ${skillBtns}
      <button class="slot-btn potion ${player.potions <= 0 ? 'dim' : ''}" id="slot-potion" title="Poción de Ámbar (+42% HP / +45% SP)">
        <span class="slot-key">Q</span>
        <span class="slot-name">Poción Ámbar</span>
        <span class="slot-meta">×${player.potions}</span>
      </button>
    `;
    this.hotbarEl.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => this.cb.onSkillSlot(Number(btn.dataset.slot)));
    });
    this.hotbarEl.querySelector('#slot-potion')!.addEventListener('click', () => this.cb.onUsePotion());

    // Bottom EXP bar
    const expPct = Math.min(100, (player.exp / Math.max(1, player.expToNext)) * 100);
    this.expBarFill.style.width = `${expPct}%`;

    // Offer Modal
    const offerKey = state.pendingOffer ? `${state.pendingOffer.source}:${state.pendingOffer.choices.join(',')}:${state.rerolls}` : '';
    if (offerKey !== this.lastOfferKey) {
      this.lastOfferKey = offerKey;
      if (state.pendingOffer) {
        this.renderOfferModal(state);
        this.offerModal.style.display = 'flex';
      } else {
        this.offerModal.style.display = 'none';
      }
    }

    if (this.statsOpen) {
      this.renderStatsDrawer(state);
    }

    // Summary Modal on win/loss
    if (state.status !== this.lastStatus) {
      this.lastStatus = state.status;
      if (state.status === 'victory' || state.status === 'defeat') {
        this.renderSummaryModal(state);
        this.summaryModal.style.display = 'flex';
      } else {
        this.summaryModal.style.display = 'none';
      }
    }
  }

  private drawMinimap(state: GameState): void {
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    ctx.fillStyle = '#0f1215';
    ctx.fillRect(0, 0, w, h);

    const sx = w / state.zone.width;
    const sy = h / state.zone.height;

    for (let y = 0; y < state.zone.height; y++) {
      for (let x = 0; x < state.zone.width; x++) {
        const t = state.zone.tiles[y * state.zone.width + x];
        if (t === 'wall') continue;
        ctx.fillStyle = t === 'path' ? '#574636' : '#263829';
        ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }

    // Portal
    if (state.floorIndex < this.data.mapsByFloor.length - 1) {
      ctx.fillStyle = state.portalUnlocked ? '#38bdf8' : '#475569';
      ctx.fillRect(state.zone.portal.x * sx - 3, state.zone.portal.y * sy - 3, 6, 6);
    }

    // Chests
    for (const d of state.drops) {
      if (d.kind !== 'chest') continue;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(d.x * sx - 3, d.y * sy - 3, 6, 6);
    }

    // Mobs
    for (const m of state.mobs) {
      ctx.fillStyle = m.isBoss ? '#ef4444' : m.isElite ? '#f59e0b' : '#f87171';
      const sz = m.isBoss ? 6 : 3;
      ctx.fillRect(m.x * sx - sz * 0.5, m.y * sy - sz * 0.5, sz, sz);
    }

    // Player
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(state.player.x * sx - 3, state.player.y * sy - 3, 6, 6);
  }

  private renderOfferModal(state: GameState): void {
    const offer = state.pendingOffer!;
    const title = offer.source === 'chest' ? 'Cofre de Ámbar · Elige una Reliquia o Mejora' : '¡Subida de Nivel! · Elige una Bendición';
    const cards = offer.choices
      .map((bid, idx) => {
        const boon = this.data.boonsById[bid]!;
        const info = this.data.names.boons[bid]!;
        const rank = (state.boonRanks[bid] ?? 0) + 1;
        const catLabel = boon.category === 'relic' ? 'Reliquia Fósil' : boon.category === 'skill' ? 'Especialización' : 'Mutación';
        return `
          <button class="offer-card rarity-${boon.rarity}" data-boon="${bid}">
            <div class="offer-top">
              <span class="offer-key">[${idx + 1}]</span>
              <span class="offer-cat">${catLabel} · Rango ${rank}/${boon.maxRank}</span>
            </div>
            <h3>${info.name}</h3>
            <p>${info.desc}</p>
          </button>
        `;
      })
      .join('');

    this.offerModal.innerHTML = `
      <div class="modal-card offer-wrap">
        <h2>${title}</h2>
        <div class="offer-grid">${cards}</div>
        <div class="offer-footer">
          <button class="secondary-btn" id="btn-reroll" ${state.rerolls <= 0 ? 'disabled' : ''}>🎲 Renovar (${state.rerolls})</button>
          <button class="secondary-btn" id="btn-skip">Omitir (+25% HP y +35 Ámbar)</button>
        </div>
      </div>
    `;

    this.offerModal.querySelectorAll<HTMLButtonElement>('[data-boon]').forEach((btn) => {
      btn.addEventListener('click', () => this.cb.onPickBoon(btn.dataset.boon!));
    });
    this.offerModal.querySelector('#btn-reroll')!.addEventListener('click', () => this.cb.onRerollOffer());
    this.offerModal.querySelector('#btn-skip')!.addEventListener('click', () => this.cb.onSkipOffer());
  }

  private renderStatsDrawer(state: GameState): void {
    const derived = computeDerivedStats(state, this.data);
    const p = state.player;
    const rows = STAT_KEYS.map(
      (k) => `
      <div class="stat-row">
        <span>${k}</span>
        <strong>${p.stats[k]}</strong>
        <button class="mini-btn" data-stat="${k}" ${p.statPoints <= 0 ? 'disabled' : ''}>+</button>
      </div>
    `
    ).join('');

    const relicsHtml =
      state.relics.length === 0
        ? '<p class="muted">Aún no recoges Reliquias Fósiles.</p>'
        : state.relics
            .map((rid) => {
              const r = this.data.names.relics[rid]!;
              return `<div class="relic-item"><strong>${r.name}</strong> — ${r.desc}</div>`;
            })
            .join('');

    this.statsDrawer.innerHTML = `
      <div class="drawer-head">
        <h3>Estadísticas y Reliquias</h3>
        <button class="mini-btn" id="close-stats">✕</button>
      </div>
      <div class="drawer-points">Puntos disponibles: <strong>${p.statPoints}</strong></div>
      <div class="stat-list">${rows}</div>
      <div class="derived-grid">
        <div>ATK: <strong>${derived.atk}</strong></div>
        <div>MATK: <strong>${derived.matk}</strong></div>
        <div>DEF: <strong>${derived.hardDef}</strong></div>
        <div>ASPD: <strong>${derived.aspd.toFixed(2)}/s</strong></div>
        <div>CRIT: <strong>${Math.round(derived.critChance * 100)}%</strong></div>
        <div>VEL: <strong>${derived.moveSpeed.toFixed(1)}</strong></div>
      </div>
      <h4>Reliquias Fósiles (${state.relics.length})</h4>
      <div class="relic-list">${relicsHtml}</div>
    `;

    this.statsDrawer.querySelector('#close-stats')!.addEventListener('click', () => this.toggleStatsDrawer());
    this.statsDrawer.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach((btn) => {
      btn.addEventListener('click', () => this.cb.onAllocateStat(btn.dataset.stat as StatKey));
    });
  }

  private renderSummaryModal(state: GameState): void {
    const cls = this.data.classesById[state.player.classId]!;
    const clsName = this.data.names.classes[cls.id]!.name;
    const won = state.status === 'victory';
    const secs = Math.round(state.stats.elapsedMs / 1000);

    this.summaryModal.innerHTML = `
      <div class="modal-card compact">
        <div class="summary-badge ${won ? 'win' : 'loss'}">${won ? '¡VICTORIA JURÁSICA!' : 'CAÍDO EN EL CRETÁCICO'}</div>
        <img class="pixel-sprite big-preview" src="${getDinoPreviewDataUrl(cls.spriteId)}" alt="${clsName}" />
        <h2>${clsName} · Nivel ${state.player.level}</h2>
        <div class="summary-stats">
          <div>Tiempo: <strong>${secs}s</strong></div>
          <div>Bajas: <strong>${state.stats.kills}</strong></div>
          <div>Élites: <strong>${state.stats.elitesKilled}</strong></div>
          <div>Daño total: <strong>${state.stats.damageDealt}</strong></div>
          <div>Bendiciones: <strong>${state.stats.boonsPicked}</strong></div>
          <div>Ámbar: <strong>${state.player.amber}</strong></div>
        </div>
        <div class="modal-actions-col">
          <button class="primary-btn" id="sum-retry">Jugar de Nuevo</button>
          <button class="secondary-btn" id="sum-title">Elegir Otro Dinosaurio</button>
        </div>
      </div>
    `;
    this.summaryModal.querySelector('#sum-retry')!.addEventListener('click', () => {
      this.cb.onStartRun(state.player.classId, state.seed, state.player.autoCast);
    });
    this.summaryModal.querySelector('#sum-title')!.addEventListener('click', () => this.cb.onReturnToTitle());
  }
}
