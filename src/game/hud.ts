import { getBoonIconUrl } from '../assets/boonIcons.ts';
import { getDinoPreviewDataUrl, getDinoPreviewFrames } from '../assets/pixelArt.ts';
import { audioManager } from '../audio/synth.ts';
import { AMBER_OFFER_COST, AMBER_POTION_COST, AMBER_REROLL_COST, getBuildTagCounts } from '../core/boons.ts';
import type { GameData } from '../core/data.ts';
import { computeDerivedStats, getBasicAttackRange, TAG_SET_TIERS } from '../core/stats.ts';
import type { BuildTag, GameState, StatKey } from '../core/types.ts';

export interface HudCallbacks {
  onStartRun: (classId: string, seed: string, autoCast: boolean, playCutscene?: boolean) => void;
  onDevLevelUp: () => void;
  onDevStage: (index: number) => void;
  onSkillSlot: (index: number) => void;
  onDash: () => void;
  onUltimate: () => void;
  onUsePotion: () => void;
  onToggleAutoAttack: () => void;
  onToggleAutoCast: () => void;
  onToggleMute: () => void;
  onPickBoon: (boonId: string) => void;
  onRerollOffer: () => void;
  onSkipOffer: () => void;
  onBuyAmberPotion: () => void;
  onBuyAmberOffer: () => void;
  onSetPaused: (paused: boolean) => void;
  onReturnToTitle: () => void;
  onJoystickMove: (sx: number, sy: number) => void;
}

const STAT_KEYS: StatKey[] = ['STR', 'AGI', 'VIT', 'INT', 'DEX', 'LUK'];

export class GameHud {
  private selectedClassId: string;
  private seed = 'dinolike-2026';
  private autoCastStart = false;
  private statsOpen = false;
  private escOpen = false;
  private muted = false;
  private lastOfferKey = '';
  private lastStatus = '';
  private lastZoneId = '';
  private zoneBannerTimer: number | null = null;
  private lastState: GameState | null = null;
  private lastSyncMs = 0;
  private previewAnimTimer: number | null = null;
  private previewAnimFrame = 0;

  private devPanel!: HTMLDetailsElement;
  private titleEl!: HTMLDivElement;
  private hudLayer!: HTMLDivElement;
  private statusCard!: HTMLDivElement;
  private waveHudEl!: HTMLDivElement;
  private bossBarEl!: HTMLDivElement;
  private zoneBannerEl!: HTMLDivElement;
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
    this.showLoading();
  }

  private buildDom(): void {
    this.root.innerHTML = '';

    // 1. Title Screen
    this.titleEl = document.createElement('div');
    this.titleEl.id = 'title-overlay';
    this.root.appendChild(this.titleEl);

    // 2. Active HUD layer
    this.hudLayer = document.createElement('div');
    this.hudLayer.id = 'hud-layer';
    this.hudLayer.style.display = 'none';
    this.root.appendChild(this.hudLayer);

    this.statusCard = document.createElement('div');
    this.statusCard.id = 'status-card';
    this.hudLayer.appendChild(this.statusCard);

    this.waveHudEl = document.createElement('div');
    this.waveHudEl.id = 'wave-hud';
    this.hudLayer.appendChild(this.waveHudEl);

    this.bossBarEl = document.createElement('div');
    this.bossBarEl.id = 'boss-bar';
    this.bossBarEl.style.display = 'none';
    this.hudLayer.appendChild(this.bossBarEl);

    this.zoneBannerEl = document.createElement('div');
    this.zoneBannerEl.id = 'zone-banner';
    this.hudLayer.appendChild(this.zoneBannerEl);

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

    this.devPanel = document.createElement('details');
    this.devPanel.id = 'dev-panel';
    this.devPanel.open = window.innerWidth > 700;
    const labels = this.data.names.ui;
    this.devPanel.innerHTML = `
      <summary>${labels.devTitle}</summary>
      <div class="dev-controls">
        <button class="secondary-btn" id="dev-level">${labels.devLevel} (+1)</button>
        <label for="dev-stage">${labels.devStage}</label>
        <select id="dev-stage"></select>
        <p>${labels.devHint}</p>
      </div>
    `;
    const stageSelect = this.devPanel.querySelector<HTMLSelectElement>('select')!;
    this.data.mapsByFloor.forEach((map, index) => {
      stageSelect.add(new Option(`${index + 1} · ${this.data.names.maps[map.id] ?? map.id}`, String(index)));
    });
    const devButton = this.devPanel.querySelector('button')!;
    // Release focus after each action: a focused button/select keeps swallowing
    // movement keys (the panel stops keydown propagation) and blocks WASD.
    devButton.addEventListener('click', () => {
      this.cb.onDevLevelUp();
      devButton.blur();
    });
    stageSelect.addEventListener('change', () => {
      this.cb.onDevStage(Number(stageSelect.value));
      stageSelect.blur();
    });
    // Keep game shortcuts from stealing keyboard interaction with the panel.
    this.devPanel.addEventListener('keydown', (event) => event.stopPropagation());
    this.devPanel.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.hudLayer.appendChild(this.devPanel);

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
    const [gameTitle, gameRealm = 'Reino Jurásico'] = this.data.names.ui.title.split(':').map((part) => part.trim());

    const cardsHtml = this.data.classes
      .map((cls) => {
        const info = this.data.names.classes[cls.id]!;
        const active = cls.id === this.selectedClassId ? 'selected' : '';
        const frames = getDinoPreviewFrames(cls.spriteId);
        const preview = frames[this.previewAnimFrame % frames.length]!;
        return `
          <button class="dino-card ${active}" data-class="${cls.id}" style="--accent:${cls.accentColor}" aria-pressed="${active ? 'true' : 'false'}">
            <img class="pixel-sprite" data-preview-sprite="${cls.spriteId}" src="${preview}" alt="${info.name}" />
            <div class="dino-card-name">${info.name}</div>
            <div class="dino-card-weapon">${this.data.names.weapons[cls.weaponType]}</div>
          </button>
        `;
      })
      .join('');

    const skillChips = [
      ...selected.activeSkillIds.map((sid, i) => {
        const sk = this.data.names.skills[sid]!;
        return `<div class="skill-chip"><span>[${i + 1}]</span> <strong>${sk.name}</strong> — ${sk.desc}</div>`;
      }),
      (() => {
        const sk = this.data.names.skills[selected.dashSkillId]!;
        return `<div class="skill-chip"><span>[Espacio]</span> <strong>${sk.name}</strong> (Dash) — ${sk.desc}</div>`;
      })(),
      (() => {
        const sk = this.data.names.skills[selected.ultimateSkillId]!;
        return `<div class="skill-chip ult"><span>[3/E] ★</span> <strong>${sk.name}</strong> (Ultimate) — ${sk.desc}</div>`;
      })(),
    ].join('');

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
        <section class="landing-hero" aria-labelledby="dinolike-title">
          <div class="landing-copy">
            <p class="landing-genre">${this.data.names.ui.subtitle}</p>
            <h1 id="dinolike-title"><span>${gameTitle}</span><small>${gameRealm}</small></h1>
            <p class="landing-lede">Cinco guerreros prehistóricos. Un reino quebrado. Una cacería contra la oscuridad.</p>
            <button id="explore-classes-btn" class="landing-action">Elige tu dinosaurio</button>
            <p class="landing-oath">Sobrevive a las oleadas. Forja tu build. Desafía al Hoja-Abisal.</p>
          </div>
          <div class="landing-art" role="img" aria-label="Guerreros dinosaurio frente al Spinosaurus Hoja-Abisal en un reino en ruinas">
            <video class="landing-cinematic" autoplay muted loop playsinline preload="auto" poster="/landing/concept-art-dark-fantasy.jpg" aria-hidden="true">
              <source src="/landing/dinolike-landing.mp4" type="video/mp4" />
            </video>
            <span>La Falla 23 aguarda</span>
          </div>
        </section>

        <section id="class-selection" class="class-selection" aria-labelledby="class-selection-title">
          <div class="selection-heading">
            <h2 id="class-selection-title">Elige quién cruzará la Falla</h2>
            <p>Cada especie cambia tu arma, movilidad y forma de sobrevivir.</p>
          </div>

          <div class="dino-grid">${cardsHtml}</div>

          <div class="selected-detail" style="--accent:${selected.accentColor}">
            <div class="detail-left">
              <img class="pixel-sprite big-preview" data-preview-sprite="${selected.spriteId}" src="${getDinoPreviewFrames(selected.spriteId)[this.previewAnimFrame % 4]!}" alt="${selectedInfo.name}" />
              <div class="arch-pill">${archName}</div>
              <div class="weapon-pill">${weaponName}</div>
            </div>
            <div class="detail-right">
              <h3>${selectedInfo.name}</h3>
              <p>${selectedInfo.desc.split(' Pasiva — ')[0]}</p>
              <div class="meters-grid">
                ${bar('VIDA', selected.baseHp, 300, '#22c55e')}
                ${bar('DAÑO', Math.max(selected.baseAtk, selected.baseMatk), 38, '#ef4444')}
                ${bar('VELOCIDAD', selected.baseMoveSpeed * 10, 62, '#38bdf8')}
                ${bar('DEFENSA', selected.baseDef, 60, '#f59e0b')}
              </div>
              <div class="passive-chip">${selectedInfo.passive}</div>
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
            <button id="start-run-btn" class="primary-btn">Iniciar cacería</button>
          </div>
        </section>
      </div>
    `;

    this.titleEl.querySelector('#explore-classes-btn')!.addEventListener('click', () => {
      this.titleEl.querySelector('#class-selection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const cinematic = this.titleEl.querySelector<HTMLVideoElement>('.landing-cinematic');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cinematic?.pause();
    } else {
      void cinematic?.play().catch(() => undefined);
    }

    this.titleEl.querySelectorAll<HTMLButtonElement>('.dino-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        audioManager.unlock();
        audioManager.play('ui_click');
        this.selectedClassId = btn.dataset.class!;
        this.renderTitle();
      });
    });

    const seedInput = this.titleEl.querySelector('#seed-input') as HTMLInputElement;
    seedInput.addEventListener('input', () => {
      this.seed = seedInput.value.trim() || 'dinolike-2026';
    });

    const autoCheck = this.titleEl.querySelector('#autocast-check') as HTMLInputElement;
    autoCheck.addEventListener('change', () => {
      this.autoCastStart = autoCheck.checked;
    });

    this.titleEl.querySelector('#start-run-btn')!.addEventListener('click', () => {
      this.cb.onStartRun(this.selectedClassId, this.seed, this.autoCastStart, true);
    });
  }

  showLoading(): void {
    this.stopPreviewAnim();
    this.hudLayer.style.display = 'none';
    this.titleEl.style.display = 'flex';
    this.titleEl.innerHTML = `
      <div class="title-panel" style="max-width:520px;text-align:center;padding:34px 28px">
        <div class="title-badge">PIXEL ART · 2D ISOMÉTRICO</div>
        <div class="fantasy-heading">
          <span class="orn-divider left"></span>
          <h1>${this.data.names.ui.title}</h1>
          <span class="orn-divider right"></span>
        </div>
        <p class="title-sub" style="margin-top:14px">Cargando sprites y escenarios...</p>
      </div>
    `;
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

  hideTitleForCutscene(): void {
    this.stopPreviewAnim();
    this.titleEl.querySelector<HTMLVideoElement>('.landing-cinematic')?.pause();
    this.titleEl.style.display = 'none';
    this.hudLayer.style.display = 'none';
  }

  hideTitle(): void {
    this.hideTitleForCutscene();
    this.hudLayer.style.display = 'block';
    this.statsOpen = false;
    this.escOpen = false;
    this.lastOfferKey = '';
    this.lastStatus = '';
    this.lastZoneId = '';
    this.zoneBannerEl.classList.remove('show');
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
    const autoAtk = this.lastState?.player.autoAttack ?? true;
    const autoCast = this.lastState?.player.autoCast ?? false;
    this.escModal.innerHTML = `
      <div class="modal-card compact">
        <h2>Pausa</h2>
        <p class="muted">WASD/Flechas mover · 1/2 habilidades · Espacio Dash · 3/E Ultimate · Q poción · C build · R Auto-Cast · M Audio</p>
        <div class="toggle-pills" style="justify-content:center;margin:10px 0 14px">
          <button class="pill ${autoAtk ? 'on' : ''}" id="esc-auto-atk">Auto-Atk: ${autoAtk ? 'ON' : 'OFF'}</button>
          <button class="pill ${autoCast ? 'on' : ''}" id="esc-auto-cast">Auto-Cast [R]: ${autoCast ? 'ON' : 'OFF'}</button>
          <button class="pill ${!this.muted ? 'on' : ''}" id="esc-audio">${this.muted ? 'Audio: OFF' : 'Audio [M]: ON'}</button>
        </div>
        <div class="modal-actions-col">
          <button class="primary-btn" id="esc-resume">Continuar Cacería</button>
          <button class="secondary-btn" id="esc-restart">Reiniciar con este Dinosaurio</button>
          <button class="secondary-btn" id="esc-title">Cambiar Dinosaurio (Título)</button>
        </div>
      </div>
    `;
    this.escModal.querySelector('#esc-auto-atk')!.addEventListener('click', () => {
      this.cb.onToggleAutoAttack();
      this.renderEscModal();
    });
    this.escModal.querySelector('#esc-auto-cast')!.addEventListener('click', () => {
      this.cb.onToggleAutoCast();
      this.renderEscModal();
    });
    this.escModal.querySelector('#esc-audio')!.addEventListener('click', () => {
      this.cb.onToggleMute();
      this.renderEscModal();
    });
    this.escModal.querySelector('#esc-resume')!.addEventListener('click', () => this.toggleEscMenu());
    this.escModal.querySelector('#esc-restart')!.addEventListener('click', () => {
      if (this.lastState) {
        this.cb.onStartRun(this.lastState.player.classId, this.lastState.seed, this.lastState.player.autoCast, false);
      }
    });
    this.escModal.querySelector('#esc-title')!.addEventListener('click', () => this.cb.onReturnToTitle());
  }

  sync(state: GameState, force: boolean): void {
    this.lastState = state;
    const now = performance.now();
    if (!force && now - this.lastSyncMs < 75) return;
    this.lastSyncMs = now;
    const devDisabled = state.status !== 'playing' || state.paused || !!state.pendingOffer;
    this.devPanel.querySelector('button')!.disabled = devDisabled;
    const stageSelect = this.devPanel.querySelector('select')!;
    stageSelect.disabled = devDisabled;
    stageSelect.value = String(state.floorIndex);

    const derived = computeDerivedStats(state, this.data);
    const player = state.player;
    const cls = this.data.classesById[player.classId]!;
    const clsName = this.data.names.classes[cls.id]!.name;
    const mapDef = this.data.mapsByFloor[state.floorIndex]!;

    // Status Card
    const hpPct = Math.round((player.hp / Math.max(1, derived.maxHp)) * 100);
    const spPct = Math.round((player.sp / Math.max(1, derived.maxSp)) * 100);
    const sprintPct = Math.round(player.sprintMomentum * 100);
    const sprintMaxed = sprintPct >= 99;
    const sprintBarHtml = player.classId === 'velociraptor' && player.sprintMomentum > 0.05
      ? `<div class="bar-row sprint${sprintMaxed ? ' maxed' : ''}"><div class="bar-fill" style="width:${sprintPct}%"></div><span>⚡ SPRINT ${sprintPct}%${sprintMaxed ? ' MAX' : ''}</span></div>`
      : '';

    const buffLabels: Record<string, string> = {
      tyrant_fury: 'Furia Tirano',
      predator_instinct: 'Instinto',
      bone_aegis: 'Égida Ósea',
      sky_tailwind: 'Viento',
      codex_overclock: '>_ Boost',
      codex_shield: '>_ Escudo',
      food_italiano: '🌭 Italiano',
      food_as: '🥩 As Italiano',
      food_salchipapas: '🍟 Salchipapas',
      food_sopaipilla: '🫓 Sopaipilla',
      food_chancaca: '🍯 Chancaca',
    };
    const activeBuffsHtml = player.buffs
      .filter((b) => b.remainingMs > 0 && buffLabels[b.id])
      .map(
        (b) =>
          `<span class="buff-chip ${b.id.startsWith('codex_') ? 'codex' : b.id.startsWith('food_') ? 'food' : ''}">${buffLabels[b.id]} ${(b.remainingMs / 1000).toFixed(0)}s</span>`
      )
      .join('');

    const canBuyPot = player.amber >= AMBER_POTION_COST;
    const canBuyOffer = player.amber >= AMBER_OFFER_COST;
    const amberShopHtml =
      canBuyPot || canBuyOffer
        ? `<div class="amber-shop-row">
            ${canBuyPot ? `<button class="pill amber-btn ready" id="pill-buy-pot" title="Gasta Ámbar para comprar una Poción">+Poción (${AMBER_POTION_COST} ◆)</button>` : ''}
            ${canBuyOffer ? `<button class="pill amber-btn ready" id="pill-buy-offer" title="Gasta Ámbar para abrir una oferta de 3 mejoras extra">✨ Forjar (${AMBER_OFFER_COST} ◆)</button>` : ''}
          </div>`
        : '';

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
            <button class="hud-mini-link" id="pill-stats" title="Ver build, stats y sinergias [C]">Build [C]</button>
          </div>
          <div class="bar-row hp"><div class="bar-fill" style="width:${hpPct}%"></div><span>HP ${Math.ceil(player.hp)} / ${derived.maxHp}</span></div>
          <div class="bar-row sp"><div class="bar-fill" style="width:${spPct}%"></div><span>SP ${Math.floor(player.sp)} / ${derived.maxSp}</span></div>
          ${sprintBarHtml}
        </div>
      </div>
      ${activeBuffsHtml ? `<div class="pet-buff-row">${activeBuffsHtml}</div>` : ''}
      ${amberShopHtml}
    `;
    this.statusCard.querySelector('#pill-stats')?.addEventListener('click', () => this.toggleStatsDrawer());
    this.statusCard.querySelector('#pill-buy-pot')?.addEventListener('click', () => this.cb.onBuyAmberPotion());
    this.statusCard.querySelector('#pill-buy-offer')?.addEventListener('click', () => this.cb.onBuyAmberOffer());

    // Boss HP Bar or Top-Center Wave Progression HUD
    const boss = state.mobs.find((m) => m.isBoss && m.hp > 0);
    const globalTotalWaves = this.data.mapsByFloor.reduce((sum, m) => sum + m.totalWaves, 0);
    const globalWave =
      this.data.mapsByFloor.slice(0, state.floorIndex).reduce((sum, m) => sum + m.totalWaves, 0) + state.currentWave;
    const isLastWave = state.currentWave >= state.totalWaves;
    const isOneBeforeBoss = globalWave === globalTotalWaves - 1;

    if (boss) {
      const pct = Math.max(0, Math.round((boss.hp / boss.maxHp) * 100));
      this.bossBarEl.style.display = 'block';
      this.waveHudEl.style.display = 'none';
      this.bossBarEl.innerHTML = `
        <div class="boss-title">
          <span>⚔️ ${this.data.names.mobs[boss.mobId]}</span>
          <span>${boss.bossPhase === 2 ? 'FASE 2 · FURIA ABISAL' : 'FASE 1'} · ${Math.ceil(boss.hp)}/${boss.maxHp}</span>
        </div>
        <div class="boss-track"><div class="boss-fill ${boss.bossPhase === 2 ? 'phase2' : ''}" style="width:${pct}%"></div></div>
      `;
    } else {
      this.bossBarEl.style.display = 'none';
      this.waveHudEl.style.display = 'block';
      const totalFloors = this.data.mapsByFloor.length;
      const nextFloorName = this.data.mapsByFloor[state.floorIndex + 1]
        ? (this.data.names.maps[this.data.mapsByFloor[state.floorIndex + 1]!.id] ?? `Nivel ${state.floorIndex + 2}`)
        : '';
      if (state.zoneClearDelayMs > 0) {
        this.waveHudEl.className = 'cleared';
        this.waveHudEl.innerHTML = `
          <div class="wave-hud-top">
            <span class="wave-badge">NIVEL ${state.floorIndex + 1}/${totalFloors} COMPLETADO</span>
            <span class="wave-count">Avanzando a ${nextFloorName}...</span>
          </div>
          <div class="wave-track"><div class="wave-fill cleared" style="width:100%"></div></div>
        `;
      } else if (isOneBeforeBoss) {
        this.waveHudEl.className = 'final-wave';
        this.waveHudEl.innerHTML = `
          <div class="wave-hud-top">
            <span class="wave-badge">¡QUEDA UNA PURA! · OLEADA ${globalWave}/${globalTotalWaves} (JEFE FINAL PRÓXIMO)</span>
            <span class="wave-count">${state.mobs.length} enemigos · Limpia para pasar de nivel</span>
          </div>
          <div class="wave-track"><div class="wave-fill final" style="width:100%"></div></div>
        `;
      } else if (isLastWave) {
        this.waveHudEl.className = 'final-wave';
        this.waveHudEl.innerHTML = `
          <div class="wave-hud-top">
            <span class="wave-badge">ÚLTIMA OLEADA DEL NIVEL · ${globalWave}/${globalTotalWaves}</span>
            <span class="wave-count">${state.mobs.length} enemigos · Limpia para pasar de nivel</span>
          </div>
          <div class="wave-track"><div class="wave-fill final" style="width:100%"></div></div>
        `;
      } else {
        const nextSec = Math.max(0, Math.ceil(state.waveTimerMs / 1000));
        const pct = Math.max(0, Math.min(100, Math.round((1 - state.waveTimerMs / Math.max(1, mapDef.waveIntervalMs)) * 100)));
        this.waveHudEl.className = '';
        this.waveHudEl.innerHTML = `
          <div class="wave-hud-top">
            <span class="wave-badge">NIVEL ${state.floorIndex + 1}/${totalFloors} · OLEADA ${globalWave}/${globalTotalWaves}</span>
            <span class="wave-count">${state.mobs.length} enemigos · Próx. en ${nextSec}s</span>
          </div>
          <div class="wave-track"><div class="wave-fill" style="width:${pct}%"></div></div>
        `;
      }
    }

    // Minimap + Zone Info + Dark-Fantasy Location Discovered Banner
    const zoneDisplayName = this.data.names.maps[mapDef.id] ?? mapDef.id;
    if (mapDef.id !== this.lastZoneId) {
      this.lastZoneId = mapDef.id;
      this.showZoneBanner(zoneDisplayName, state.floorIndex + 1, Boolean(mapDef.bossId));
    }
    this.zoneLabelEl.textContent = `${state.floorIndex + 1}/${this.data.mapsByFloor.length} · ${zoneDisplayName}`;
    if (mapDef.bossId) {
      this.goalLabelEl.textContent = boss ? 'Objetivo: Derrota al Jefe' : '¡Victoria!';
      this.goalLabelEl.style.color = '#ef4444';
    } else if (state.zoneClearDelayMs > 0) {
      this.goalLabelEl.textContent = '★ ¡Zona despejada! Avanzando...';
      this.goalLabelEl.style.color = '#4ade80';
    } else if (isOneBeforeBoss) {
      this.goalLabelEl.textContent = `¡Queda una pura! · ${state.mobs.length} vivos`;
      this.goalLabelEl.style.color = '#f97316';
    } else if (isLastWave) {
      this.goalLabelEl.textContent = `Última oleada del nivel · ${globalWave}/${globalTotalWaves} · ${state.mobs.length} vivos`;
      this.goalLabelEl.style.color = '#f97316';
    } else {
      const nextSec = Math.max(0, Math.ceil(state.waveTimerMs / 1000));
      this.goalLabelEl.textContent = `Oleada ${globalWave}/${globalTotalWaves} · Próx. ${nextSec}s`;
      this.goalLabelEl.style.color = '#fbbf24';
    }
    this.drawMinimap(state);

    // Hotbar: [1] Skill 1, [2] Skill 2, [Espacio] Dash, [3/E] Ultimate, [Q] Poción
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

    const dashSk = this.data.skillsById[cls.dashSkillId]!;
    const dashInfo = this.data.names.skills[cls.dashSkillId]!;
    const dashCd = player.skillCooldowns[cls.dashSkillId] ?? 0;
    const dashDim = dashCd > 0 || player.sp < dashSk.spCost;

    const ultSk = this.data.skillsById[cls.ultimateSkillId]!;
    const ultInfo = this.data.names.skills[cls.ultimateSkillId]!;
    const ultCd = player.skillCooldowns[cls.ultimateSkillId] ?? 0;
    const ultDim = ultCd > 0 || player.sp < ultSk.spCost;

    const potionMeta =
      player.potions === 1 ? '×1 ¡Queda una pura!' : `×${player.potions}`;

    this.hotbarEl.innerHTML = `
      ${skillBtns}
      <button class="slot-btn dash ${dashDim ? 'dim' : ''}" id="slot-dash" title="[Espacio] ${dashInfo.desc}">
        <span class="slot-key">ESPACIO</span>
        <span class="slot-name">${dashInfo.name}</span>
        <span class="slot-meta">${dashCd > 0 ? `${(dashCd / 1000).toFixed(1)}s` : `${dashSk.spCost} SP`}</span>
      </button>
      <button class="slot-btn ultimate ${ultDim ? 'dim' : 'ready'}" id="slot-ult" title="[3 / E] ULTIMATE: ${ultInfo.desc}">
        <span class="slot-key">3 / E</span>
        <span class="slot-name">★ ${ultInfo.name}</span>
        <span class="slot-meta">${ultCd > 0 ? `${(ultCd / 1000).toFixed(1)}s` : `${ultSk.spCost} SP`}</span>
      </button>
      <button class="slot-btn potion ${player.potions <= 0 ? 'dim' : ''} ${player.potions === 1 ? 'potion-last' : ''}" id="slot-potion" title="Poción de Ámbar (+42% HP / +45% SP)">
        <span class="slot-key">Q</span>
        <span class="slot-name">Poción Ámbar</span>
        <span class="slot-meta">${potionMeta}</span>
      </button>
    `;
    this.hotbarEl.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => this.cb.onSkillSlot(Number(btn.dataset.slot)));
    });
    this.hotbarEl.querySelector('#slot-dash')!.addEventListener('click', () => this.cb.onDash());
    this.hotbarEl.querySelector('#slot-ult')!.addEventListener('click', () => this.cb.onUltimate());
    this.hotbarEl.querySelector('#slot-potion')!.addEventListener('click', () => this.cb.onUsePotion());

    // Bottom EXP bar
    const expPct = Math.min(100, (player.exp / Math.max(1, player.expToNext)) * 100);
    this.expBarFill.style.width = `${expPct}%`;

    // Offer Modal
    const offerKey = state.pendingOffer
      ? `${state.pendingOffer.source}:${state.pendingOffer.choices.join(',')}:${state.rerolls}:${state.player.amber >= AMBER_REROLL_COST ? 1 : 0}`
      : '';
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

  private showZoneBanner(zoneName: string, floorNum: number, isBoss: boolean): void {
    if (this.zoneBannerTimer !== null) {
      window.clearTimeout(this.zoneBannerTimer);
      this.zoneBannerTimer = null;
    }
    const sub = isBoss ? 'Santuario del Jefe · Zona Final' : `Zona descubierta · Piso ${floorNum}/${this.data.mapsByFloor.length}`;
    this.zoneBannerEl.innerHTML = `
      <span class="orn-divider white left"></span>
      <div class="zone-banner-text">
        <div class="zone-banner-sub">${sub}</div>
        <div class="zone-banner-title">${zoneName}</div>
      </div>
      <span class="orn-divider white right"></span>
    `;
    this.zoneBannerEl.classList.remove('show');
    void this.zoneBannerEl.offsetWidth;
    this.zoneBannerEl.classList.add('show');
    this.zoneBannerTimer = window.setTimeout(() => {
      this.zoneBannerEl.classList.remove('show');
      this.zoneBannerTimer = null;
    }, 3200);
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
        if (t === 'wall' || t === 'void') continue;
        ctx.fillStyle = t === 'path' ? '#574636' : '#263829';
        ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }

    // Chests & Chilean Fast Food Drops
    for (const d of state.drops) {
      if (d.kind === 'chest') {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(d.x * sx - 3, d.y * sy - 3, 6, 6);
      } else if (d.kind === 'food') {
        ctx.fillStyle = '#86efac';
        ctx.fillRect(d.x * sx - 2, d.y * sy - 2, 4, 4);
      }
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
    const tagCounts = getBuildTagCounts(state, this.data);
    const activeTags = (Object.entries(tagCounts) as [BuildTag, number][])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    const buildBarHtml =
      activeTags.length > 0
        ? `<div class="offer-build-bar">Tus sinergias (junta <strong>2</strong> o <strong>4</strong> para activar bonos de conjunto): ${activeTags
            .map(([t, c]) => {
              const [t2, t4] = TAG_SET_TIERS[t];
              const tip = `(2) ${t2.label} · (4) ${t4.label}`;
              const nextGoal = c >= 4 ? 'MAX ✓' : c >= 2 ? `${c}/4 ✓` : `${c}/2`;
              return `<span class="tag-pill active" title="${tip}">${this.data.names.tags[t]} ${nextGoal}</span>`;
            })
            .join('')}</div>`
        : `<div class="offer-build-bar muted">Las etiquetas (🔥 Volcán, ✨ Arcano, etc.) activan <strong>bonos de conjunto al juntar 2 o 4</strong> y suben la prob. de cartas afines.</div>`;

    const title =
      offer.source === 'chest'
        ? 'Cofre de Ámbar · Elige una Reliquia o Sinergia'
        : `¡Nivel ${state.player.level}! · Construye tu Build`;

    const catLabels: Record<string, string> = {
      stat: 'Atributo',
      mutation: 'Mutación',
      skill: 'Especialización',
      relic: 'Reliquia Fósil',
      capstone: '★ Piedra Angular',
    };
    const rarityLabels: Record<string, string> = {
      common: 'Común',
      rare: 'Rara',
      epic: 'Épica',
      legendary: 'Legendaria',
    };

    const cards = offer.choices
      .map((bid, idx) => {
        const boon = this.data.boonsById[bid]!;
        const info = this.data.names.boons[bid]!;
        const rank = (state.boonRanks[bid] ?? 0) + 1;
        const tagsHtml = boon.tags
          .map((t) => {
            const [t2, t4] = TAG_SET_TIERS[t];
            const cur = tagCounts[t];
            const tip = `Bono de conjunto — (2): ${t2.label} | (4): ${t4.label}`;
            return `<span class="tag-pill ${cur > 0 ? 'active' : ''}" title="${tip}">${this.data.names.tags[t]} (${cur}→${cur + 1})</span>`;
          })
          .join('');
        return `
          <button class="offer-card rarity-${boon.rarity}" data-boon="${bid}">
            <div class="offer-top">
              <span class="offer-key">[${idx + 1}] ${rarityLabels[boon.rarity]}</span>
              <span class="offer-cat">${catLabels[boon.category]} · ${rank}/${boon.maxRank}</span>
            </div>
            <div class="offer-title-row">
              <img class="boon-icon boon-icon-offer" src="${getBoonIconUrl(bid)}" alt="" />
              <h3>${info.name}</h3>
            </div>
            <p>${info.desc}</p>
            <div class="offer-tags">${tagsHtml}</div>
          </button>
        `;
      })
      .join('');

    const canRerollFree = state.rerolls > 0;
    const canRerollAmber = !canRerollFree && state.player.amber >= AMBER_REROLL_COST;
    const rerollLabel = canRerollFree
      ? `🎲 Renovar (${state.rerolls} gratis)`
      : `🎲 Renovar (${AMBER_REROLL_COST} ◆ · tienes ${state.player.amber} ◆)`;

    this.offerModal.innerHTML = `
      <div class="modal-card offer-wrap">
        <div class="fantasy-heading compact">
          <span class="orn-divider left"></span>
          <h2>${title}</h2>
          <span class="orn-divider right"></span>
        </div>
        ${buildBarHtml}
        <div class="offer-grid">${cards}</div>
        <div class="offer-footer">
          <button class="secondary-btn" id="btn-reroll" ${!canRerollFree && !canRerollAmber ? 'disabled' : ''}>${rerollLabel}</button>
          <button class="secondary-btn" id="btn-skip">Omitir (+25% HP y +35 ◆ Ámbar)</button>
        </div>
      </div>
    `;

    this.offerModal.querySelectorAll<HTMLButtonElement>('[data-boon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audioManager.play('ui_click');
        this.cb.onPickBoon(btn.dataset.boon!);
      });
    });
    this.offerModal.querySelector('#btn-reroll')!.addEventListener('click', () => {
      audioManager.play('ui_click');
      this.cb.onRerollOffer();
    });
    this.offerModal.querySelector('#btn-skip')!.addEventListener('click', () => this.cb.onSkipOffer());
  }

  private renderStatsDrawer(state: GameState): void {
    const derived = computeDerivedStats(state, this.data);
    const tagCounts = getBuildTagCounts(state, this.data);

    const rows = STAT_KEYS.map(
      (k) => `
      <div class="stat-row">
        <span>${k}</span>
        <strong>${derived.effectiveStats[k]}</strong>
      </div>
    `
    ).join('');

    const tagsHtml = (Object.keys(TAG_SET_TIERS) as BuildTag[])
      .map((t) => {
        const c = tagCounts[t];
        const [t2, t4] = TAG_SET_TIERS[t];
        const activeTier = c >= 4 ? 'tier-max' : c >= 2 ? 'tier-on' : '';
        return `
          <div class="set-row ${activeTier}">
            <div class="set-head"><strong>${this.data.names.tags[t]}</strong> <span>${c}/4</span></div>
            <div class="set-tiers">
              <span class="${c >= 2 ? 'lit' : ''}">(2) ${t2.label}</span><br/>
              <span class="${c >= 4 ? 'lit' : ''}">(4) ${t4.label}</span>
            </div>
          </div>
        `;
      })
      .join('');

    const pickedBoonsHtml = Object.entries(state.boonRanks)
      .filter(([, r]) => r > 0)
      .map(([bid, r]) => {
        const info = this.data.names.boons[bid];
        return `
          <div class="relic-item">
            <img class="boon-icon boon-icon-acquired" src="${getBoonIconUrl(bid)}" alt="" />
            <span><strong>${info?.name ?? bid}</strong> (Nv ${r})</span>
          </div>
        `;
      })
      .join('');

    const hornRow =
      state.player.classId === 'triceratops'
        ? `<div>Cuernos: <strong>${getBasicAttackRange(state, this.data).toFixed(1)} m</strong></div>`
        : '';

    this.statsDrawer.innerHTML = `
      <div class="drawer-head">
        <h3>Build y Sinergias</h3>
        <button class="mini-btn" id="close-stats">✕</button>
      </div>
      <div class="stat-list">${rows}</div>
      <div class="derived-grid">
        <div>ATK: <strong>${derived.atk}</strong></div>
        <div>MATK: <strong>${derived.matk}</strong></div>
        <div>DEF: <strong>${derived.hardDef}</strong></div>
        <div>ASPD: <strong>${derived.aspd.toFixed(2)}/s</strong></div>
        <div>CRIT: <strong>${Math.round(derived.critChance * 100)}%</strong></div>
        <div>VEL: <strong>${derived.moveSpeed.toFixed(1)}</strong></div>
        ${hornRow}
      </div>
      <h4>Sinergias Activas</h4>
      ${tagsHtml}
      <h4>Mejoras y Reliquias (${state.stats.boonsPicked})</h4>
      <div class="relic-list">${pickedBoonsHtml || '<p class="muted">Sin mejoras aún.</p>'}</div>
    `;

    this.statsDrawer.querySelector('#close-stats')!.addEventListener('click', () => this.toggleStatsDrawer());
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
