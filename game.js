console.log('Game Script Loaded');

// 性能优化常量
const MAX_ENEMIES = 300; // 限制同屏最大敌人数
const MAX_FLOATING_TEXTS = 50; // 限制同屏飘字数
const VIEW_CULL_BUFFER = 100; // 渲染剔除缓冲区（像素）

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// 敌人 id 计数器，用于合并飘字等
let enemyIdCounter = 0;

// ========== 画布响应式适配 ==========
const BASE_WIDTH = 800;
const BASE_HEIGHT = 600;

function resizeCanvas() {
  const maxW = window.innerWidth * 0.95;
  const maxH = window.innerHeight * 0.95;
  const scale = Math.min(maxW / BASE_WIDTH, maxH / BASE_HEIGHT);
  canvas.style.width = Math.floor(BASE_WIDTH * scale) + 'px';
  canvas.style.height = Math.floor(BASE_HEIGHT * scale) + 'px';
  // 内部分辨率保持不变，保证游戏逻辑不受影响
  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ========== 游戏启动状态 ==========
let gameStarted = false; // 游戏是否已开始
let pausedByPlayer = false; // 玩家手动暂停

    // ================= 精灵表动画系统 =================
    // 精灵图已用 Python 离线处理好透明背景，直接加载即可

    const catSpriteSheet = new Image();
    catSpriteSheet.src = './assets/cat_sprite.png';
    let spriteReady = false;
    catSpriteSheet.onload = function() {
      spriteReady = true;
      console.log('Sprite loaded: ' + catSpriteSheet.width + 'x' + catSpriteSheet.height);
    };
    catSpriteSheet.onerror = function() {
      console.error('Sprite load failed!');
    };

    // 精灵表布局：4列×2行
    const SPRITE_COLS = 4;
    const SPRITE_ROWS = 2;

    // 动画配置
    const SPRITE = {
      idle: { row: 0, frames: 4, fps: 4 },
      run:  { row: 1, frames: 4, fps: 8 }
    };

    // 动画状态
    let spriteAnimTimer = 0;
    let spriteFrameIndex = 0;
    let currentAnim = 'idle';
    let lastAnimTime = Date.now();

    // ============================================

    // 武器类型定义（阵列存储：player.weapons 最多 6 个槽位）
    const WEAPON_TYPES = {
      PISTOL: {
        name: '左轮',
        cooldown: 700,      // 中等射速
        range: 280,
        damage: 1.2,
        bulletSpeed: 10,
        bulletRadius: 5,
        bulletColor: '#ffffff',  // 白色
        spread: 0,
        pelletCount: 1
      },
      SHOTGUN: {
        name: '散弹枪',
        cooldown: 1100,     // 装填慢
        range: 160,         // 射程短
        damage: 1,
        bulletSpeed: 9,
        bulletRadius: 4,
        bulletColor: '#fbbf24',  // 黄色
        spread: 28,
        pelletCount: 5
      },
      SMG: {
        name: '冲锋枪',
        cooldown: 180,      // 极快射速
        range: 320,         // 射程长
        damage: 0.4,       // 伤害低
        bulletSpeed: 12,
        bulletRadius: 3,   // 子弹小
        bulletColor: '#3b82f6',  // 蓝色
        spread: 0,
        pelletCount: 1
      },
      SALTY_FISH: {
        name: '咸鱼大剑',
        type: 'melee',      // 近战类型
        cooldown: 1000,
        damage: 2.0,
        range: 100,
        bulletSpeed: 0,    // 不移动，原地生成
        bulletRadius: 40,  // 巨大剑气
        bulletColor: '#ffd700',
        spread: 0,
        pelletCount: 1
      },
      SCREAMING_CHICKEN: {
        name: '尖叫鸡',
        type: 'aoe',       // 范围类型
        cooldown: 2000,
        damage: 0.5,
        range: 150,
        bulletSpeed: 8,   // 波纹扩散速度
        bulletRadius: 20,
        bulletColor: '#ffff00',
        spread: 0,
        pelletCount: 1,
        knockback: 50     // 极高击退
      },
      MOUSE_BOT: {
        name: '机械鼠群',
        type: 'summon',    // 召唤类型
        cooldown: 1500,
        damage: 3.0,
        range: 400,        // 追踪范围
        bulletSpeed: 6,   // 追踪速度
        bulletRadius: 8,
        bulletColor: '#808080',
        spread: 0,
        pelletCount: 1
      },
      CATNIP: {
        name: '猫薄荷',
        type: 'aura',       // 光环类型
        cooldown: 1200,
        damage: 0.8,
        range: 180,         // 圆环范围
        bulletSpeed: 0,
        bulletRadius: 180,
        bulletColor: '#90EE90',
        spread: 0,
        pelletCount: 1
      },
      YARN_BALL: {
        name: '毛线球',
        type: 'projectile', // 投掷类型
        cooldown: 2000,
        damage: 1.5,
        range: 300,         // 投掷范围
        bulletSpeed: 8,
        bulletRadius: 12,
        bulletColor: '#FF69B4',
        spread: 0,
        pelletCount: 1
      }
    };

    // 敌人类型定义
    const ENEMY_TYPES = {
      NORMAL: { color: '#ef4444', sizeScale: 1, hpScale: 1, speedScale: 1, weight: 0.7 },
      TANK:   { color: '#7f1d1d', sizeScale: 1.5, hpScale: 3, speedScale: 0.5, weight: 0.15 },
      RUSHER: { color: '#f97316', sizeScale: 0.8, hpScale: 0.5, speedScale: 1.5, weight: 0.15 }
    };

    // SoundEngine: Web Audio API 实时合成（无外部音频文件）
    const SoundEngine = {
      audioCtx: null,
      masterGain: null,
      bgmTimer: null,
      beatIndex: 0,
      unlocked: false,

      init() {
        if (this.audioCtx) return;
        try {
          this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.gain.value = 0.28;
          this.masterGain.connect(this.audioCtx.destination);
        } catch (e) {
          console.warn('Web Audio API not supported:', e);
        }
      },

      resume() {
        this.init();
        if (!this.audioCtx) return;

        const onReady = () => {
          this.unlocked = true;
          this.startBgm();
        };

        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().then(onReady).catch(err => {
            console.warn('AudioContext resume failed:', err);
          });
        } else {
          onReady();
        }
      },

      isReady() {
        this.init();
        return !!(this.audioCtx && this.audioCtx.state === 'running');
      },

      playToneAt(freq, type, duration, volume, startTime, endFreq) {
        if (!this.isReady()) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        if (typeof endFreq === 'number') {
          osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), startTime + duration);
        }

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
      },

      playShoot() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        // 高频快速下坠：哔！
        this.playToneAt(1650, 'triangle', 0.08, 0.18, t, 220);
      },

      playExplosion() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;

        // 低频白噪声：砰！
        const noiseBuffer = this.audioCtx.createBuffer(1, Math.floor(this.audioCtx.sampleRate * 0.28), this.audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }

        const noise = this.audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;

        const lowpass = this.audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(220, t);
        lowpass.frequency.exponentialRampToValueAtTime(70, t + 0.28);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.32, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

        noise.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.3);
      },

      playPickup() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        // 短促上升音阶：叮！
        this.playToneAt(700, 'sine', 0.055, 0.11, t);
        this.playToneAt(920, 'triangle', 0.07, 0.1, t + 0.05);
      },

      playPowerUp() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        // 琶音上升
        this.playToneAt(392, 'triangle', 0.11, 0.12, t);
        this.playToneAt(494, 'triangle', 0.11, 0.12, t + 0.09);
        this.playToneAt(587, 'triangle', 0.12, 0.13, t + 0.18);
        this.playToneAt(784, 'triangle', 0.18, 0.14, t + 0.28);
      },

      playHit() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        this.playToneAt(180, 'square', 0.06, 0.055, t, 120);
      },

      playGodMode() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        // 特殊长音效
        this.playToneAt(180, 'sawtooth', 0.85, 0.12, t, 360);
        this.playToneAt(360, 'triangle', 0.95, 0.08, t + 0.05, 520);
      },

      playVictory() {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        this.playToneAt(262, 'sine', 0.26, 0.1, t);
        this.playToneAt(330, 'sine', 0.26, 0.1, t + 0.1);
        this.playToneAt(392, 'sine', 0.4, 0.11, t + 0.2);
      },

      playBeat(strong) {
        if (!this.isReady()) return;
        const t = this.audioCtx.currentTime;
        const baseFreq = strong ? 62 : 52;
        const vol = strong ? 0.1 : 0.075;
        this.playToneAt(baseFreq, 'sine', 0.13, vol, t, 42);
        if (strong) {
          this.playToneAt(120, 'triangle', 0.05, 0.035, t + 0.01, 95);
        }
      },

      startBgm() {
        if (this.bgmTimer) return;
        this.bgmTimer = window.setInterval(() => {
          const strong = this.beatIndex % 2 === 0;
          this.playBeat(strong);
          this.beatIndex++;
        }, 500); // 每秒两下
      }
    };

    // 初始化音频系统
    SoundEngine.init();

    // 首次点击画布视作“开始游戏”交互，解锁音频
    canvas.addEventListener('pointerdown', () => {
      SoundEngine.resume();
    }, { once: true });

    // 玩家：位置、大小、移动速度、经验与等级
    const player = {
      x: canvas.width / 2 - 15,
      y: canvas.height / 2 - 15,
      size: 30,
      speed: 3.5,
      attackRadius: 200,    // 全局攻击半径（用于UI显示）
      hurtFlash: 0,
      levelUpFlash: 0,
      exp: 0,
      expToNextLevel: 100,
      level: 1,
      hp: 100,              // 生命值
      maxHp: 100,           // 最大生命值
      weapons: [],          // 武器槽位数组（最多6个）
      pickupRange: 165,     // 拾取半径（略微增大）
      // 全局属性加成
      attackSpeedMultiplier: 1.0,
      damageMultiplier: 1.0,
      // 新增属性
      lifesteal: 0,         // 吸血率 (0-1)
      armor: 0,             // 护甲值（减伤点数）
      thorns: 0,            // 反伤倍率
      interest: 0,          // 利息率 (0-1)
      currency: 0,          // 金币
      // 动画状态
      lastX: canvas.width / 2 - 15,
      lastY: canvas.height / 2 - 15,
      vx: 0,                // 水平速度
      vy: 0,                // 垂直速度
      lastDirection: 1,     // 1=右, -1=左
      hurtRecoilTime: 0,    // 受击后弹回时间
      animationTime: 0,     // 本帧累积动画时间
      lastDamageTime: 0,    // 上次受伤时间戳（无敌帧机制）
      iFrameDuration: 500   // 无敌帧持续时间（毫秒）
    };

    // 游戏状态：波次、时间、统计
    const gameState = {
      startTime: Date.now(),
      currentWave: 1,
      waveTimer: 60,              // 波次倒计时（秒）
      waveStartTime: Date.now(),  // 当前波次开始时间
      enemySpawnBaseInterval: 2000,  // 基础生成间隔（毫秒）
      enemySpeedBase: 1.5,            // 基础移动速度
      enemySpawnMultiplier: 1.0,      // 生成频率倍数
      enemySpeedMultiplier: 1.0,     // 速度倍数
      enemyDamageMultiplier: 1.0,    // 伤害倍率（随波次提升）
      killCount: 0,
      isDead: false,
      berserk: false,              // 狂暴时间触发
      swarmTriggered: false        // 当前波次是否已触发尸潮
    };

    // 全局数组
    const enemies = [];
    const bullets = [];
    const enemyBullets = []; // Boss子弹
    const expOrbs = [];
    const coins = [];         // 金币系统
    const particles = [];
    const floatingTexts = []; // 新增：伤害飘字数组
    const catnipRings = [];   // 猫薄荷光环数组
    const yarnBalls = [];     // 毛线球爆炸数组
    let screenShake = 0; // 全局：画面震动强度
    let coinHudPop = 0;  // 金币UI拾取弹跳强度

    // Boss相关
    let boss = null;
    let lastBossAttack = 0;
    const BOSS_ATTACK_INTERVAL = 2000;

    // 精英怪/警告/定时器
    let lastEliteSpawn = Date.now();
    const ELITE_INTERVAL = 60000; // 60秒一只精英
    let warningTimer = 0;

    // 尸潮机制
    let lastHordeTime = 0;
    const HORDE_INTERVAL = 30000; // 30秒

    // 游戏状态：暂停（升级选技能时）、是否显示升级菜单
    let gamePaused = false;
    let showLevelUpText = 0;  // 显示 "LEVEL UP!" 的帧数
    let waveCleanupActive = false;
    let waveCleanupStart = 0;
    const WAVE_RECALL_SPEED_MULT = 5;
    const WAVE_RECALL_MAX_MS = 900;
    let godMode = false;
    const GOD_MODE_CODE = 'whatsyourdaddy';
    let godModeBuffer = '';

    // 键盘状态
    const keys = { w: false, a: false, s: false, d: false };

    // 时间控制
    let lastEnemySpawn = 0;
    let lastWaveCheck = 0;

    // 武器槽位：以阵列形式存储，最多 6 个
    const MAX_WEAPON_SLOTS = 6;
    function addWeapon(type) {
      if (player.weapons.length >= MAX_WEAPON_SLOTS) return false;
      const weaponDef = WEAPON_TYPES[type];
      if (!weaponDef) return false;
      player.weapons.push({
        type: type,
        name: weaponDef.name,
        cooldown: weaponDef.cooldown,
        range: weaponDef.range || 200,
        damage: weaponDef.damage,
        lastAttackTime: 0,
        bulletSpeed: weaponDef.bulletSpeed || 0,
        bulletRadius: weaponDef.bulletRadius || 5,
        bulletColor: weaponDef.bulletColor || '#ffffff',
        spread: weaponDef.spread || 0,
        pelletCount: weaponDef.pelletCount || 1
      });
      return true;
    }

    // 商店逻辑：已有该武器则伤害+20%，没有则占新槽位
    function buyOrUpgradeWeapon(weaponType) {
      const existing = player.weapons.find(w => w.type === weaponType);
      if (existing) {
        existing.damage *= 1.2;
        return true;
      }
      return addWeapon(weaponType);
    }

    addWeapon('PISTOL');  // 初始武器：左轮


    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (keys.hasOwnProperty(k)) keys[k] = true;

      // ESC 暂停/恢复
      if (e.key === 'Escape' && gameStarted && !gameState.isDead) {
        togglePause();
        return;
      }

      // Easter Egg: 输入 whatsyourdaddy 开启无敌模式
      if (k.length === 1 && k >= 'a' && k <= 'z') {
        godModeBuffer = (godModeBuffer + k).slice(-GOD_MODE_CODE.length);
        if (!godMode && godModeBuffer === GOD_MODE_CODE) {
          godMode = true;
          SoundEngine.resume();
          SoundEngine.playGodMode();
          console.log('God Mode Activated! 喵星人降临！');
        }
      }
    });
    document.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (keys.hasOwnProperty(k)) keys[k] = false;
    });

    // ========== 波次系统 ==========
    function updateWave() {
      const now = Date.now();
      const elapsed = Math.floor((now - gameState.waveStartTime) / 1000);
      gameState.waveTimer = Math.max(0, 60 - elapsed);
      
      // 更新UI显示
      const minutes = Math.floor(gameState.waveTimer / 60);
      const seconds = gameState.waveTimer % 60;
      const timerText = `WAVE ${gameState.currentWave} | ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      document.getElementById('waveTimer').textContent = timerText;
      
      // 检查尸潮触发（倒计时剩余30秒时）
      if (gameState.waveTimer <= 30 && gameState.waveTimer > 29 && !gameState.swarmTriggered) {
        gameState.swarmTriggered = true;
        spawnSwarmHorde();
      }
      
      // 波次结束：倒计时归零
      if (gameState.waveTimer <= 0 && !gamePaused && !waveCleanupActive) {
        endWave();
      }
    }
    
    // 波次结束逻辑
    function endWave() {
      // 杀死所有普通敌人（Boss不在enemies数组中，所以不会被清除）
      enemies.length = 0;

      startWaveResourceRecall();
    }

    // 波次结算前：全图资源强制回收至玩家
    function startWaveResourceRecall() {
      waveCleanupActive = true;
      waveCleanupStart = Date.now();

      expOrbs.forEach(orb => {
        orb.forceRecall = true;
      });
      coins.forEach(coin => {
        coin.forceRecall = true;
      });

      if (expOrbs.length === 0 && coins.length === 0) {
        finalizeWaveEnd();
      }
    }

    function finalizeWaveEnd() {
      if (!waveCleanupActive) return;
      waveCleanupActive = false;

      // 利息机制：每波结束获得利息
      if (player.interest > 0 && player.currency > 0) {
        const interestGain = Math.floor(player.currency * player.interest);
        player.currency += Math.min(interestGain, 50); // 最多50金币
      }
      
      // 暂停游戏
      gamePaused = true;
      
      // 显示商店界面
      showShopMenu();
    }
    
    // 显示商店菜单（盲盒机版本）
    function showShopMenu() {
      console.log('Shop Opened!');
      const overlay = document.getElementById('shopOverlay');
      const shopCards = document.getElementById('shopCards');
      const gachaBtn = document.getElementById('gachaBtn');
      const nextWaveBtn = document.getElementById('nextWaveBtn');
      
      // 生成常规商品
      const regularItems = [
        { name: '猫薄荷 🌿', type: 'attackSpeed', desc: '+10% 攻速', price: 30 },
        { name: '猫抓板 🪵', type: 'damage', desc: '+15% 伤害', price: 40 },
        { name: '高级罐头 🥫', type: 'maxHp', desc: '回复 30% HP', price: 50 }
      ];
      
      shopCards.innerHTML = regularItems.map((item, i) => `
        <div class="shop-item-card" data-item-type="${item.type}" data-price="${item.price}">
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
          <div class="item-price">🐟 ${item.price}</div>
          <button class="buy-btn">购买</button>
        </div>
      `).join('');
      
      // 绑定常规商品事件
      shopCards.querySelectorAll('.buy-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.shop-item-card');
          const price = parseInt(card.dataset.price);
          const type = card.dataset.itemType;
          if (player.currency >= price) {
            player.currency -= price;
            handleShopItem(type);
            showShopMenu(); // 刷新商店
          } else {
            alert('鱼干不足！');
          }
        });
      });
      
      // 绑定盲盒事件（用 onclick 覆盖，避免重复绑定）
      gachaBtn.onclick = () => {
        if (player.currency >= 20) {
          player.currency -= 20;
          const result = performGacha();
          showGachaResult(result);
          showShopMenu(); // 刷新商店
        } else {
          alert('鱼干不足！');
        }
      };
      
      // 绑定下一波事件
      nextWaveBtn.onclick = () => {
        SoundEngine.resume();
        overlay.style.display = 'none';
        startNextWave();
      };
      
      overlay.style.display = 'flex';
    }
    
    
    // 盲盒抽取逻辑
    function performGacha() {
      const rand = Math.random();
      if (rand < 0.1) {
        // 10% 大奖：全属性+5%
        player.attackSpeedMultiplier *= 1.05;
        player.damageMultiplier *= 1.05;
        player.speed *= 1.05;
        return { type: 'grand', message: '🎉 大奖！全属性+5%！' };
      } else if (rand < 0.6) {
        // 50% 普通道具
        const items = ['attackSpeed', 'damage', 'moveSpeed', 'maxHp'];
        const itemType = items[Math.floor(Math.random() * items.length)];
        handleShopItem(itemType);
        return { type: 'common', message: '获得普通道具！' };
      } else if (rand < 0.9) {
        // 30% 烂鱼骨头
        player.speed *= 0.98; // 轻微负面
        return { type: 'junk', message: '🐟 烂鱼骨头...移速-2%' };
      } else {
        // 10% 回血
        player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.5));
        return { type: 'heal', message: '💚 回复50% HP！' };
      }
    }
    
    // 显示盲盒结果
    function showGachaResult(result) {
      const overlay = document.createElement('div');
      overlay.className = 'gacha-result-overlay';
      overlay.innerHTML = `
        <div class="gacha-result">
          <h3>${result.message}</h3>
          <button onclick="this.parentElement.parentElement.remove()">确定</button>
        </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 3000);
    }
    
    // 处理商店物品购买
    function handleShopItem(type) {
      if (type === 'attackSpeed') {
        player.attackSpeedMultiplier *= 1.1;
      } else if (type === 'damage') {
        player.damageMultiplier *= 1.15;
      } else if (type === 'moveSpeed') {
        player.speed *= 1.1;
      } else if (type === 'maxHp') {
        const healAmount = Math.floor(player.maxHp * 0.3);
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
      }
    }
    
    // 开始下一波
    function startNextWave() {
      SoundEngine.resume();
      gameState.currentWave++;
      gameState.waveStartTime = Date.now();
      gameState.waveTimer = 60;
      gameState.swarmTriggered = false;
      waveCleanupActive = false;
      waveCleanupStart = 0;
      
      // 每波次：生成频率+20%，移动速度+10%
      gameState.enemySpawnMultiplier *= 0.8;  // 间隔减少20% = 频率增加20%
      gameState.enemySpeedMultiplier *= 1.1;  // 速度增加10%
      // 难度曲线加速：伤害倍率从1.1逐步拉到1.25上限
      const baseInc = 0.1;
      const extra = Math.min(0.15, (gameState.currentWave - 1) * 0.005); // 每波增加0.5%，最多+15%
      gameState.enemyDamageMultiplier = 1 + baseInc + extra;
      
      // 第10波生成超级老鼠王 Boss
      if (gameState.currentWave === 10 && !boss) {
        spawnBoss();
        SoundEngine.playPowerUp();
      }
      
      // 隐藏商店界面
      document.getElementById('shopOverlay').style.display = 'none';
      gamePaused = false;
    }
    
    // 下一波按钮事件由 showShopMenu 统一设置

    // ========== 生成敌人 ==========
    function spawnElite() {
      // 产生一个体积3倍、血厚的精英怪
      if (enemies.length >= MAX_ENEMIES) return;
      const size = 20 * 3 * (gameState.berserk ? 0.7 : 1);
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = Math.random() * canvas.width; y = -size; }
      else if (side === 1) { x = canvas.width + size; y = Math.random() * canvas.height; }
      else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + size; }
      else { x = -size; y = Math.random() * canvas.height; }
      enemies.push({
        id: ++enemyIdCounter,
        x, y,
        size,
        radius: size / 2,
        speed: gameState.enemySpeedBase * gameState.enemySpeedMultiplier * 0.5 * (gameState.berserk ? 2 : 1),
        type: 'elite',
        hp: 200,
        maxHp: 200,
        isElite: true,
        hurtFlash: 0
      });
      warningTimer = 120; // 2秒红警告
    }

    function spawnSwarm() {
      const count = 10;
      const radius = 200;
      if (enemies.length >= MAX_ENEMIES) return;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const ex = player.x + player.size / 2 + Math.cos(ang) * radius - 10;
        const ey = player.y + player.size / 2 + Math.sin(ang) * radius - 10;
        enemies.push({
          id: ++enemyIdCounter,
          x: ex,
          y: ey,
          size: 20 * (gameState.berserk ? 0.7 : 1),
          radius: 10 * (gameState.berserk ? 0.7 : 1),
          speed: gameState.enemySpeedBase * gameState.enemySpeedMultiplier * (gameState.berserk ? 2 : 1),
          type: 'normal',
          hp: 1,
          maxHp: 1,
          isSwarm: true,
          hurtFlash: 0
        });
      }
    }

    // 尸潮生成：20只疯狗（波次系统触发）
    function spawnSwarmHorde() {
      const count = 20; // 固定20只
      const enemyConfig = ENEMY_TYPES.RUSHER;
      const baseHp = 1 * enemyConfig.hpScale;
      const baseSpeed = gameState.enemySpeedBase * gameState.enemySpeedMultiplier * enemyConfig.speedScale * (gameState.berserk ? 2 : 1);
      const baseSize = 20 * enemyConfig.sizeScale * (gameState.berserk ? 0.7 : 1);
      const enemyColor = enemyConfig.color;

      // 限制敌人数量
      const actualCount = Math.min(count, MAX_ENEMIES - enemies.length);
      if (actualCount <= 0) return;

      for (let i = 0; i < actualCount; i++) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Math.random() * canvas.width; y = -baseSize; }
        else if (side === 1) { x = canvas.width + baseSize; y = Math.random() * canvas.height; }
        else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + baseSize; }
        else { x = -baseSize; y = Math.random() * canvas.height; }
        enemies.push({
          id: ++enemyIdCounter,
          x: x,
          y: y,
          size: baseSize,
          radius: baseSize / 2,
          speed: baseSpeed,
          type: 'rusher',
          hp: baseHp,
          maxHp: baseHp,
          color: enemyColor,
          hurtFlash: 0
        });
      }

      // 显示警告
      const warning = document.getElementById('warningText');
      warning.style.display = 'block';
      setTimeout(() => {
        warning.style.display = 'none';
      }, 3000);
    }
    
    // 旧版尸潮生成（保留兼容性，但不再使用）
    function spawnHorde() {
      spawnSwarmHorde();
    }

    // Boss生成（第10波）
    function spawnBoss() {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      boss = {
        x: centerX - 60,
        y: centerY - 60,
        size: 120,              // 巨大体型
        radius: 60,              // 半径60
        hp: 2000,                // 超高血量2000
        maxHp: 2000,
        color: '#9333ea',        // 紫色
        speed: 0.8,
        isBoss: true,
        isKing: true,
        isDead: false,           // Boss死亡标记
        lastAttackTime: 0,
        wobbleSeed: Math.random() * Math.PI * 2,
        renderJitterX: 0,
        renderJitterY: 0
      };
      
      // 显示Boss血条并初始化为满血
      const container = document.getElementById('bossHealthBarContainer');
      const fill = document.getElementById('bossHealthFill');
      if (container) container.style.display = 'flex';
      if (fill) fill.style.width = '100%';
    }

    // 根据权重选择敌人类型
    function selectEnemyType() {
      const rand = Math.random();
      let cumulative = 0;
      for (const [key, config] of Object.entries(ENEMY_TYPES)) {
        cumulative += config.weight;
        if (rand < cumulative) {
          return key;
        }
      }
      return 'NORMAL'; // fallback
    }

    function spawnEnemy() {
      const now = Date.now();
      // 精英怪定时
      if (now - lastEliteSpawn >= ELITE_INTERVAL) {
        lastEliteSpawn = now;
        spawnElite();
      }
      const spawnInterval = gameState.enemySpawnBaseInterval * gameState.enemySpawnMultiplier;
      
      if (now - lastEnemySpawn >= spawnInterval) {
        lastEnemySpawn = now;

        // 20% 几率触发包围圈
        if (Math.random() < 0.2 && gameState.currentWave > 1) {
          spawnSwarm();
          return;
        }

        // 限制敌人数量
        if (enemies.length >= MAX_ENEMIES) {
          return; // 达到上限，跳过生成
        }

        // 随机选择屏幕的哪条边（0=上, 1=右, 2=下, 3=左）
        const side = Math.floor(Math.random() * 4);
        let x, y;

        if (side === 0) {  // 上边
          x = Math.random() * canvas.width;
          y = -20;
        } else if (side === 1) {  // 右边
          x = canvas.width + 20;
          y = Math.random() * canvas.height;
        } else if (side === 2) {  // 下边
          x = Math.random() * canvas.width;
          y = canvas.height + 20;
        } else {  // 左边
          x = -20;
          y = Math.random() * canvas.height;
        }

        // 随机决定敌人类型
        const enemyTypeKey = selectEnemyType();
        const enemyConfig = ENEMY_TYPES[enemyTypeKey];
        const baseHp = 1 * enemyConfig.hpScale;
        const baseSpeed = gameState.enemySpeedBase * gameState.enemySpeedMultiplier * enemyConfig.speedScale * (gameState.berserk ? 2 : 1);
        const baseSize = 20 * enemyConfig.sizeScale * (gameState.berserk ? 0.7 : 1);
        const enemyColor = enemyConfig.color;
        
        enemies.push({
          id: ++enemyIdCounter,
          x: x,
          y: y,
          size: baseSize,  // 保持兼容性
          radius: baseSize / 2,
          speed: baseSpeed,
          type: enemyTypeKey.toLowerCase(),
          hp: baseHp,
          maxHp: baseHp,
          color: enemyColor,
          hurtFlash: 0
        });
      }
    }

    // ========== 多武器攻击系统 ==========
    // 每把武器独立计时，自动锁定范围内最近目标（包括 Boss）
    function updateWeapons() {
      const now = Date.now();
      const px = player.x + player.size / 2;
      const py = player.y + player.size / 2;

      player.weapons.forEach(weapon => {
        const effectiveCooldown = weapon.cooldown / player.attackSpeedMultiplier;
        if (now - weapon.lastAttackTime < effectiveCooldown) return;

        // 初始化目标：先检查 Boss，再检查普通敌人
        let target = null;
        let minDist = weapon.range; // 初始化为射程，只接受射程内的目标

        // ========== 第一步：检查 Boss ==========
        if (boss && !boss.isDead) {
          const bossCx = boss.x + boss.radius;
          const bossCy = boss.y + boss.radius;
          const dx = bossCx - px;
          const dy = bossCy - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= weapon.range && dist < minDist) {
            target = boss;
            minDist = dist;
          }
        }

        // ========== 第二步：检查普通敌人 ==========
        const nearbyEnemies = enemies.filter(enemy => {
          const enemyRadius = enemy.radius ?? enemy.size / 2;
          const enemyCx = enemy.x + enemyRadius;
          const enemyCy = enemy.y + enemyRadius;
          const dx = enemyCx - px;
          const dy = enemyCy - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist <= weapon.range;
        });

        // 遍历普通敌人，如果比 Boss 更近则覆盖 target
        nearbyEnemies.forEach(enemy => {
          const enemyRadius = enemy.radius ?? enemy.size / 2;
          const enemyCx = enemy.x + enemyRadius;
          const enemyCy = enemy.y + enemyRadius;
          const dx = enemyCx - px;
          const dy = enemyCy - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < minDist) {
            target = enemy;
            minDist = dist;
          }
        });

        // ========== 猫薄荷：不需要目标，直接生成光环 ==========
        const weaponDef = WEAPON_TYPES[weapon.type];
        if (weaponDef.type === 'aura') {
          catnipRings.push({
            x: px,
            y: py,
            radius: weapon.range,
            damage: weapon.damage * player.damageMultiplier,
            createdAt: now,
            lifetime: 500, // 0.5秒持续时间
            color: weapon.bulletColor
          });
          weapon.lastAttackTime = now;
          SoundEngine.playShoot();
          return;
        }

        // 如果没有找到任何目标，跳过这把武器
        if (!target) return;

        // ========== 计算目标中心点（兼容 Boss 和普通敌人）==========
        let targetCx, targetCy;
        if (target === boss) {
          // Boss：使用 boss.x + boss.radius
          targetCx = boss.x + boss.radius;
          targetCy = boss.y + boss.radius;
        } else {
          // 普通敌人：使用 enemy.x + radius（或 size/2）
          const enemyRadius = target.radius ?? target.size / 2;
          targetCx = target.x + enemyRadius;
          targetCy = target.y + enemyRadius;
        }

        // 计算角度
        const dx = targetCx - px;
        const dy = targetCy - py;
        const angle = Math.atan2(dy, dx);
        const dmg = weapon.damage * player.damageMultiplier;
        const color = weapon.bulletColor || '#a78bfa';

        // ========== 根据武器类型执行不同攻击逻辑 ==========
        if (weaponDef.type === 'melee') {
          // 咸鱼大剑：近战扇形攻击
          const swingAngle = angle;
          const swingRange = weapon.range;
          const swingArc = Math.PI / 3; // 60度扇形
          const startAngle = swingAngle - swingArc / 2;
          const endAngle = swingAngle + swingArc / 2;
          
          // 生成一个巨大的扇形剑气（存在0.2秒）
          bullets.push({
            x: px,
            y: py,
            radius: weapon.bulletRadius,
            vx: 0,
            vy: 0,
            damage: dmg,
            bulletColor: color,
            weaponType: weapon.type,
            isMelee: true,
            lifetime: 200, // 0.2秒
            startAngle: startAngle,
            endAngle: endAngle,
            range: swingRange
          });
        } else if (weaponDef.type === 'aoe') {
          // 尖叫鸡：范围波纹攻击
          bullets.push({
            x: px,
            y: py,
            radius: 10,
            vx: 0,
            vy: 0,
            damage: dmg,
            bulletColor: color,
            weaponType: weapon.type,
            isAOE: true,
            maxRadius: weapon.range,
            currentRadius: 10,
            knockback: weaponDef.knockback || 50
          });
        } else if (weaponDef.type === 'summon') {
          // 机械鼠群：追踪敌人
          bullets.push({
            x: px,
            y: py,
            radius: weapon.bulletRadius,
            vx: Math.cos(angle) * weapon.bulletSpeed,
            vy: Math.sin(angle) * weapon.bulletSpeed,
            damage: dmg,
            bulletColor: color,
            weaponType: weapon.type,
            isTracking: true,
            targetX: targetCx,
            targetY: targetCy,
            trackingSpeed: weapon.bulletSpeed
          });
        } else if (weaponDef.type === 'projectile') {
          // 毛线球：投掷物体，到达目标位置时爆炸
          const distance = Math.sqrt(dx * dx + dy * dy);
          const speed = weapon.bulletSpeed;
          const duration = distance / speed;
          yarnBalls.push({
            x: px,
            y: py,
            startX: px,        // 保存初始位置用于插值
            startY: py,
            targetX: targetCx,
            targetY: targetCy,
            radius: weapon.bulletRadius,
            damage: dmg,
            color: weapon.bulletColor,
            speed: speed,
            createdAt: now,
            maxDuration: duration * 1000, // 转换为毫秒
            weaponType: weapon.type
          });
        } else {
          // 普通武器：原有逻辑
          if (weapon.pelletCount === 1) {
            // 左轮 / 冲锋枪：单发
            bullets.push({
              x: px,
              y: py,
              radius: weapon.bulletRadius,
              vx: Math.cos(angle) * weapon.bulletSpeed,
              vy: Math.sin(angle) * weapon.bulletSpeed,
              damage: dmg,
              bulletColor: color,
              weaponType: weapon.type
            });
          } else {
            // 散弹枪：扇形 5 发
            const spreadRad = (weapon.spread * Math.PI) / 180;
            const startAngle = angle - spreadRad / 2;
            const angleStep = spreadRad / (weapon.pelletCount - 1);
            for (let i = 0; i < weapon.pelletCount; i++) {
              const pelletAngle = startAngle + angleStep * i;
              bullets.push({
                x: px,
                y: py,
                radius: weapon.bulletRadius,
                vx: Math.cos(pelletAngle) * weapon.bulletSpeed,
                vy: Math.sin(pelletAngle) * weapon.bulletSpeed,
                damage: dmg,
                bulletColor: color,
                weaponType: weapon.type
              });
            }
          }
        }

        weapon.lastAttackTime = now;
        // 播放射击音效
        SoundEngine.playShoot();
      });
    }

    // 更新敌人位置（向玩家移动），并处理精英怪射击
    // Boss移动和攻击更新
    function updateBoss() {
      if (!boss || boss.isDead) return;

      const now = Date.now();
      const px = player.x + player.size / 2;
      const py = player.y + player.size / 2;
      const bx = boss.x + boss.radius;
      const by = boss.y + boss.radius;

      // Boss向玩家移动，但速度慢
      const dx = px - bx;
      const dy = py - by;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        boss.x += (dx / distance) * boss.speed;
        boss.y += (dy / distance) * boss.speed;
      }

      // Boss移动时缓慢震动感（仅视觉偏移，不影响碰撞）
      if (distance > 1) {
        boss.renderJitterX = Math.sin(now / 130 + boss.wobbleSeed) * 1.8;
        boss.renderJitterY = Math.cos(now / 170 + boss.wobbleSeed) * 1.2;
      } else {
        boss.renderJitterX = 0;
        boss.renderJitterY = 0;
      }

      // 约束Boss在屏幕内
      boss.x = Math.max(0, Math.min(canvas.width - boss.size, boss.x));
      boss.y = Math.max(0, Math.min(canvas.height - boss.size, boss.y));

      // 更新Boss血条（如果存在）
      if (boss.hp > 0) {
        const healthPercent = (boss.hp / boss.maxHp) * 100;
        const fill = document.getElementById('bossHealthFill');
        if (fill) fill.style.width = healthPercent + '%';
      }

      // Boss攻击：每1.5秒向玩家发射一颗红色大子弹
      if (!boss.lastAttackTime) boss.lastAttackTime = now;
      
      const BOSS_ATTACK_INTERVAL = 1500; // 1.5秒
      
      if (now - boss.lastAttackTime >= BOSS_ATTACK_INTERVAL) {
        boss.lastAttackTime = now;
        
        // 向玩家发射红色大子弹
        const angle = Math.atan2(dy, dx);
        enemyBullets.push({
          x: bx,
          y: by,
          vx: Math.cos(angle) * 5,
          vy: Math.sin(angle) * 5,
          radius: 12,              // 大子弹
          color: '#ff0000',        // 红色
          damage: 20               // Boss子弹伤害
        });
      }

      // Boss死亡检查
      if (boss.hp <= 0 && !boss.isDead) {
        boss.isDead = true;
        triggerVictory();
      }
    }

    // 胜利逻辑
    function triggerVictory() {
      gamePaused = true;
      SoundEngine.playVictory();
      
      // 停止所有敌人生成
      enemies.length = 0;
      enemyBullets.length = 0;
      bullets.length = 0;
      
      // 生成纸屑效果
      spawnConfetti();
      
      // 显示胜利画面
      setTimeout(() => {
        const winOverlay = document.getElementById('winOverlay');
        if (winOverlay) {
          winOverlay.classList.add('show');
        }
      }, 500);
    }

    // 纸屑效果生成
    function spawnConfetti() {
      const confettiCount = 100;
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ff69b4'];
      
      for (let i = 0; i < confettiCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 3;
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        particles.push({
          x: canvas.width / 2,
          y: canvas.height / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2, // 向上倾斜
          alpha: 1.0,
          size: Math.random() * 5 + 3,
          color: color,
          gravityScale: 0.3,
          lifetime: 3000, // 3秒后消失
          createdAt: Date.now()
        });
      }
    }

    function updateEnemies() {
      const now = Date.now();
      enemies.forEach((enemy, idx) => {
        // 递减受击闪白计时
        if (enemy.hurtFlash > 0) enemy.hurtFlash--;
        
        const dx = (player.x + player.size / 2) - (enemy.x + enemy.radius);
        const dy = (player.y + player.size / 2) - (enemy.y + enemy.radius);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          enemy.x += (dx / distance) * enemy.speed;
          enemy.y += (dy / distance) * enemy.speed;
        }

        // 精英怪周期性射弹幕
        if (enemy.isElite) {
          if (!enemy.lastShotTime) enemy.lastShotTime = now;
          if (now - enemy.lastShotTime >= 2000) {
            // 发射一圈红色子弹（敌方子弹，伤害玩家）
            const bulletCount = 20;
            for (let i = 0; i < bulletCount; i++) {
              const ang = (i / bulletCount) * Math.PI * 2;
              enemyBullets.push({
                x: enemy.x + enemy.radius,
                y: enemy.y + enemy.radius,
                radius: 4,
                vx: Math.cos(ang) * 4,
                vy: Math.sin(ang) * 4,
                damage: 15,
                color: '#ff0000'
              });
            }
            enemy.lastShotTime = now;
          }
        }
      });
    }

    // 更新子弹位置（包括特殊武器类型）
    function updateBullets() {
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        
        // 近战武器：剑气存在时间递减
        if (bullet.isMelee) {
          bullet.lifetime -= 16; // 假设60fps，每帧约16ms
          if (bullet.lifetime <= 0) {
            bullets.splice(i, 1);
            continue;
          }
        }
        // AOE武器：波纹扩散
        else if (bullet.isAOE) {
          bullet.currentRadius += bullet.maxRadius / 30; // 快速扩散
          if (bullet.currentRadius >= bullet.maxRadius) {
            bullets.splice(i, 1);
            continue;
          }
        }
        // 追踪武器：自动追踪最近敌人
        else if (bullet.isTracking) {
          let nearestEnemy = null;
          let minDist = Infinity;
          const allTargets = [...enemies];
          if (boss && !boss.isDead) allTargets.push(boss);
          
          allTargets.forEach(target => {
            const tx = target === boss ? target.x + target.radius : target.x + (target.radius ?? target.size / 2);
            const ty = target === boss ? target.y + target.radius : target.y + (target.radius ?? target.size / 2);
            const dx = tx - bullet.x;
            const dy = ty - bullet.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
              minDist = dist;
              nearestEnemy = target;
            }
          });
          
          if (nearestEnemy) {
            const tx = nearestEnemy === boss ? nearestEnemy.x + nearestEnemy.radius : nearestEnemy.x + (nearestEnemy.radius ?? nearestEnemy.size / 2);
            const ty = nearestEnemy === boss ? nearestEnemy.y + nearestEnemy.radius : nearestEnemy.y + (nearestEnemy.radius ?? nearestEnemy.size / 2);
            const dx = tx - bullet.x;
            const dy = ty - bullet.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              bullet.vx = (dx / dist) * bullet.trackingSpeed;
              bullet.vy = (dy / dist) * bullet.trackingSpeed;
            }
          }
          
          bullet.x += bullet.vx;
          bullet.y += bullet.vy;
        }
        // 普通子弹：正常移动
        else {
          bullet.x += bullet.vx;
          bullet.y += bullet.vy;
        }

        // 移除超出屏幕的子弹
        if (bullet.x < -100 || bullet.x > canvas.width + 100 ||
            bullet.y < -100 || bullet.y > canvas.height + 100) {
          bullets.splice(i, 1);
        }
      }
    }

    // Boss子弹更新
    function updateEnemyBullets() {
      enemyBullets.forEach(bullet => {
        // 如果是追踪球，稍微调整方向
        if (bullet.isTracking) {
          const playerX = player.x + player.size / 2;
          const playerY = player.y + player.size / 2;
          const dx = playerX - bullet.x;
          const dy = playerY - bullet.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 0) {
            // 轻微追踪
            const turnSpeed = 0.05;
            const targetVx = (dx / dist) * 3.5;
            const targetVy = (dy / dist) * 3.5;
            bullet.vx += (targetVx - bullet.vx) * turnSpeed;
            bullet.vy += (targetVy - bullet.vy) * turnSpeed;
          }
        }
        
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
      });

      // 移除超出屏幕的子弹
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        if (enemyBullets[i].x < 0 || enemyBullets[i].x > canvas.width ||
            enemyBullets[i].y < 0 || enemyBullets[i].y > canvas.height) {
          enemyBullets.splice(i, 1);
        }
      }
    }

    // ✅ updateParticles 必须是一个独立的函数，和 updateBullets 平级
    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
    
        // 物理模拟
        p.vx *= 0.95; // 摩擦力
        p.vy *= 0.95;
        p.alpha -= 0.02; // 透明度衰减
    
        // 如果透明度为0，就移除
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }
    }
    // 碰撞检测：子弹 vs 敌人

    // 创建/合并伤害飘字（性能优化）
    // ownerId 可用于标识目标（enemy.id 或 'boss'），以便合并短时间内的多次伤害
    function createFloatingText(x, y, text, color = '#ffffff', ownerId = null) {
      // 只显示较大伤害以减少渲染压力
      const numeric = parseInt(String(text).replace(/[^0-9]/g, '')) || 0;
      if (numeric > 0 && numeric < 5) return; // 小于5点伤害不显示

      // 合并同一 target 在 200ms 内的飘字
      if (ownerId) {
        const now = performance.now();
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
          const ft = floatingTexts[i];
          if (ft.ownerId === ownerId && now - (ft._ts || 0) < 200) {
            // 合并数值（若为数字），并重置显示参数 
            const prev = parseInt(String(ft.text).replace(/[^0-9]/g, '')) || 0;
            const add = numeric || 0;
            if (prev || add) {
              ft.text = String(prev + add);
            } else {
              ft.text = text;
            }
            ft.alpha = 1.0;
            ft.vy = 0.6;
            ft.fade = 0.02;
            ft._ts = now;
            return;
          }
        }
      }

      // 限制飘字数量
      if (floatingTexts.length >= MAX_FLOATING_TEXTS) {
        // 移除最早的一个以腾出空间
        floatingTexts.shift();
      }

      floatingTexts.push({ x, y, text: String(text), alpha: 1.0, vy: 0.6, fade: 0.02, color, ownerId, _ts: performance.now() });
    }

    // 更新伤害飘字：向上漂移并淡出
    function updateFloatingTexts() {
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const t = floatingTexts[i];
        t.y -= t.vy; // 向上移动
        t.alpha -= t.fade; // 渐隐
        if (t.alpha <= 0) floatingTexts.splice(i, 1);
      }
    }

    // 更新猫薄荷圆环：持续伤害、有呼吸效果
    function updateCatnips() {
      for (let i = catnipRings.length - 1; i >= 0; i--) {
        const ring = catnipRings[i];
        const elapsed = Date.now() - ring.createdAt;
        
        if (elapsed >= ring.lifetime) {
          catnipRings.splice(i, 1);
          continue;
        }

        // 对范围内的敌人造成伤害
        enemies.forEach(enemy => {
          const enemyRadius = enemy.radius ?? enemy.size / 2;
          const dx = (enemy.x + enemyRadius) - ring.x;
          const dy = (enemy.y + enemyRadius) - ring.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < ring.radius + enemyRadius) {
            enemy.hp -= ring.damage * 0.016; // 每帧伤害（约60fps）
          }
        });
      }
    }

    // 更新毛线球：投掷物体飞行，到达目标时爆炸
    function updateYarnBalls() {
      for (let i = yarnBalls.length - 1; i >= 0; i--) {
        const ball = yarnBalls[i];
        const elapsed = Date.now() - ball.createdAt;
        
        if (elapsed >= ball.maxDuration) {
          // 爆炸效果
          createYarnBallExplosion(ball);
          yarnBalls.splice(i, 1);
          continue;
        }
        
        // 线性移动向目标（使用保存的初始位置做插值）
        const progress = Math.min(1, elapsed / ball.maxDuration);
        ball.x = ball.startX + (ball.targetX - ball.startX) * progress;
        ball.y = ball.startY + (ball.targetY - ball.startY) * progress;
      }
    }

    // 毛线球爆炸效果
    function createYarnBallExplosion(ball) {
      // 对范围内的敌人造成伤害和击退
      const explosionRadius = 120;
      const px = ball.x;
      const py = ball.y;
      
      SoundEngine.playExplosion();
      
      // 生成窒子效果
      for (let k = 0; k < 15; k++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        particles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1.0,
          size: Math.random() * 3 + 2,
          color: '#FF69B4'
        });
      }
      
      enemies.forEach(enemy => {
        const enemyRadius = enemy.radius ?? enemy.size / 2;
        const dx = (enemy.x + enemyRadius) - px;
        const dy = (enemy.y + enemyRadius) - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < explosionRadius + enemyRadius) {
          enemy.hp -= ball.damage;
          enemy.hurtFlash = 6;
          SoundEngine.playHit();
          
          // 击退效果
          const knockback = 40 / (enemyRadius || 10);
          const dirX = dx / (dist || 1);
          const dirY = dy / (dist || 1);
          enemy.x += dirX * knockback;
          enemy.y += dirY * knockback;
        }
      });
    }

    // 碰撞检测：子弹 vs 普通敌人（仅处理小怪，Boss 由 checkBossCollision 处理）
    function checkBulletEnemyCollision() {
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
          const enemy = enemies[j];
          
          // AABB 快速剔除优化
          const enemyRadius = enemy.radius ?? enemy.size / 2;
          const maxRadius = Math.max(bullet.radius, enemyRadius);
          if (Math.abs(bullet.x - (enemy.x + enemyRadius)) > maxRadius + 20 || 
              Math.abs(bullet.y - (enemy.y + enemyRadius)) > maxRadius + 20) {
            continue; // 距离太远，跳过精确计算
          }
          
          const dx = bullet.x - (enemy.x + enemyRadius);
          const dy = bullet.y - (enemy.y + enemyRadius);
          const distance = Math.sqrt(dx * dx + dy * dy);

          // 检查碰撞（根据武器类型）
          let hit = false;
          if (bullet.isMelee) {
            // 近战：扇形范围检测
            const px = player.x + player.size / 2;
            const py = player.y + player.size / 2;
            const ex = enemy.x + enemyRadius;
            const ey = enemy.y + enemyRadius;
            const edx = ex - px;
            const edy = ey - py;
            const edist = Math.sqrt(edx * edx + edy * edy);
            if (edist <= bullet.range) {
              const eangle = Math.atan2(edy, edx);
              const angleDiff = Math.abs(eangle - bullet.startAngle);
              const normalizedDiff = angleDiff > Math.PI ? Math.PI * 2 - angleDiff : angleDiff;
              if (normalizedDiff <= (bullet.endAngle - bullet.startAngle) / 2) {
                hit = true;
              }
            }
          } else if (bullet.isAOE) {
            // AOE：波纹范围检测
            const px = bullet.x;
            const py = bullet.y;
            const ex = enemy.x + enemyRadius;
            const ey = enemy.y + enemyRadius;
            const edist = Math.sqrt((ex - px) * (ex - px) + (ey - py) * (ey - py));
            if (edist <= bullet.currentRadius + enemyRadius && edist >= bullet.currentRadius - enemyRadius - 10) {
              hit = true;
            }
          } else {
            // 普通/追踪：圆形碰撞
            if (distance < bullet.radius + enemyRadius) {
              hit = true;
            }
          }

          if (hit) {
            const _dmg = bullet.damage || 1;
            enemy.hp -= _dmg;
            
            // 吸血逻辑
            if (Math.random() < player.lifesteal) {
              player.hp = Math.min(player.maxHp, player.hp + 1);
            }
            
            // 击退（AOE武器有极高击退）
            const knockback = bullet.isAOE ? (bullet.knockback || 50) / enemyRadius : 5 / (enemyRadius || 10);
            const dirX = dx / (distance || 1);
            const dirY = dy / (distance || 1);
            enemy.x += dirX * knockback;
            enemy.y += dirY * knockback;
            
            // 受击闪白效果（约 0.1 秒 = 6 帧 @ 60fps）
            enemy.hurtFlash = 6;
            
            // 播放击中音效
            SoundEngine.playHit();
            
            // 伤害飘字：含随机向上偏移
            const textOffsetX = (Math.random() - 0.5) * 20;
            const textOffsetY = -15;
            createFloatingText(enemy.x + enemyRadius + textOffsetX, enemy.y - enemyRadius * 0.2 + textOffsetY, String(Math.ceil(_dmg)), '#ffffff', enemy.id);
            
            // 追踪武器爆炸
            if (bullet.isTracking) {
              for (let k = 0; k < 5; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 4 + 2;
                particles.push({
                  x: bullet.x,
                  y: bullet.y,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  alpha: 1.0,
                  size: Math.random() * 3 + 2,
                  color: '#808080'
                });
              }
              bullets.splice(i, 1);
            }
            
            if (enemy.hp <= 0) {
              let orbExp = 15;
              for (let k = 0; k < 8; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 6 + 2;
                particles.push({
                  x: enemy.x + enemyRadius,
                  y: enemy.y + enemyRadius,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  alpha: 1.0,
                  size: Math.random() * 4 + 3,
                  color: enemy.color || '#fff'
                });
              }
              screenShake = Math.max(screenShake, 2);
              SoundEngine.playExplosion();
              if (enemy.isElite) {
                orbExp = player.expToNextLevel - player.exp;
                if (orbExp <= 0) orbExp = player.expToNextLevel;
              }
              expOrbs.push({
                x: enemy.x + enemyRadius,
                y: enemy.y + enemyRadius,
                radius: enemy.isElite ? 14 : 10,
                exp: orbExp,
                vx: 0,
                vy: 0
              });
              
              // 金币掉落（每个敌人掉1-3枚）
              const coinCount = Math.min(3, Math.ceil(enemy.maxHp / 20));
              for (let k = 0; k < coinCount; k++) {
                coins.push({
                  x: enemy.x + enemyRadius + (Math.random() - 0.5) * 20,
                  y: enemy.y + enemyRadius + (Math.random() - 0.5) * 20,
                  vx: 0,
                  vy: 0,
                  radius: 4,
                  value: 1
                });
              }
              
              gameState.killCount++;
              enemies.splice(j, 1);
            }
            
            // 移除子弹（近战和AOE不立即移除，让它们继续作用）
            if (!bullet.isMelee && !bullet.isAOE) {
              bullets.splice(i, 1);
              break;
            } else if (bullet.isMelee || bullet.isAOE) {
              // 近战和AOE可以穿透多个敌人，不break
            }
          }
        }
      }
    }

    // 独立函数：子弹 vs Boss 碰撞检测（必须用 Boss 中心点判定）
    function checkBossCollision() {
      if (!boss || boss.isDead) return;

      const bossCx = boss.x + boss.radius;
      const bossCy = boss.y + boss.radius;

      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        
        // AABB 快速剔除优化
        const maxRadius = Math.max(bullet.radius, boss.radius);
        if (Math.abs(bullet.x - bossCx) > maxRadius + 20 || 
            Math.abs(bullet.y - bossCy) > maxRadius + 20) {
          continue; // 距离太远，跳过精确计算
        }
        
        // 检查碰撞（根据武器类型）
        let hit = false;
        if (bullet.isMelee) {
          // 近战：扇形范围检测
          const px = player.x + player.size / 2;
          const py = player.y + player.size / 2;
          const dx = bossCx - px;
          const dy = bossCy - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= bullet.range) {
            const angle = Math.atan2(dy, dx);
            const angleDiff = Math.abs(angle - bullet.startAngle);
            const normalizedDiff = angleDiff > Math.PI ? Math.PI * 2 - angleDiff : angleDiff;
            if (normalizedDiff <= (bullet.endAngle - bullet.startAngle) / 2) {
              hit = true;
            }
          }
        } else if (bullet.isAOE) {
          // AOE：波纹范围检测
          const px = bullet.x;
          const py = bullet.y;
          const dist = Math.sqrt((bossCx - px) * (bossCx - px) + (bossCy - py) * (bossCy - py));
          if (dist <= bullet.currentRadius + boss.radius && dist >= bullet.currentRadius - boss.radius - 10) {
            hit = true;
          }
        } else {
          // 普通/追踪：圆形碰撞
          const dx = bullet.x - bossCx;
          const dy = bullet.y - bossCy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < boss.radius + bullet.radius) {
            hit = true;
          }
        }

        if (hit) {
          const _dmg = bullet.damage || 1;
          boss.hp -= _dmg;
          
          // 吸血逻辑
          if (Math.random() < player.lifesteal) {
            player.hp = Math.min(player.maxHp, player.hp + 1);
          }

          // 更新 DOM：Boss 血条宽度（用内部 fill 的 width 百分比）
          const bossFill = document.getElementById('bossHealthFill');
          if (bossFill) {
            const hpPercent = Math.max(0, boss.hp / boss.maxHp);
            bossFill.style.width = (hpPercent * 100) + '%';
          }

          console.log('Boss Hit! HP:', boss.hp);

          // 追踪武器爆炸
          if (bullet.isTracking) {
            for (let k = 0; k < 5; k++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = Math.random() * 4 + 2;
              particles.push({
                x: bullet.x,
                y: bullet.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1.0,
                size: Math.random() * 3 + 2,
                color: '#808080'
              });
            }
            bullets.splice(i, 1);
          } else if (!bullet.isMelee && !bullet.isAOE) {
            bullets.splice(i, 1);
          }

          createFloatingText(bossCx, boss.y - boss.radius * 0.3, String(Math.ceil(_dmg)), '#ffff00', 'boss');

          for (let k = 0; k < 5; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            particles.push({
              x: bossCx,
              y: bossCy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              alpha: 1.0,
              size: Math.random() * 3 + 2,
              color: '#9333ea'
            });
          }
          screenShake = Math.max(screenShake, 5);

          if (boss.hp <= 0) {
            boss.isDead = true;
            const rewardCount = 10;
            for (let r = 0; r < rewardCount; r++) {
              const angle = (r / rewardCount) * Math.PI * 2;
              const dist = 50;
              expOrbs.push({
                x: bossCx + Math.cos(angle) * dist,
                y: bossCy + Math.sin(angle) * dist,
                radius: 14,
                exp: 50,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3
              });
            }
            // Boss掉落更多金币（独立循环）
            for (let k = 0; k < 20; k++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 30 + Math.random() * 20;
              coins.push({
                x: bossCx + Math.cos(angle) * dist,
                y: bossCy + Math.sin(angle) * dist,
                vx: Math.cos(angle) * 0.5,
                vy: Math.sin(angle) * 0.5,
                radius: 4,
                value: 2  // Boss币更值钱
              });
            }

            // Boss死亡粒子效果（独立循环）
            for (let k = 0; k < 30; k++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = Math.random() * 8 + 4;
              particles.push({
                x: bossCx,
                y: bossCy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1.0,
                size: Math.random() * 5 + 4,
                color: '#9333ea'
              });
            }
            screenShake = Math.max(screenShake, 30);
            SoundEngine.playExplosion();
            const container = document.getElementById('bossHealthBarContainer');
            if (container) container.style.display = 'none';
            boss = null;
            endWave();
          }
          break;
        }
      }
    }

    // 经验球：吸附与吸收
    const EXP_FLY_SPEED = 6;
    function updateExpOrbs(forceRecall = false) {
      const px = player.x + player.size / 2;
      const py = player.y + player.size / 2;
      for (let i = expOrbs.length - 1; i >= 0; i--) {
        const orb = expOrbs[i];
        const dx = px - orb.x;
        const dy = py - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const collectDist = forceRecall ? (player.size / 2 + orb.radius + 8) : (player.size / 2 + orb.radius);
        if (dist < collectDist) {
          player.exp += orb.exp;
          SoundEngine.playPickup();
          if (forceRecall) {
            player.exp = Math.min(player.exp, player.expToNextLevel);
          }
          expOrbs.splice(i, 1);
          if (!forceRecall && player.exp >= player.expToNextLevel) {
            player.exp = player.expToNextLevel;
            gamePaused = true;
            SoundEngine.playPowerUp();
            showLevelUpMenu();
          }
          continue;
        }
        if (dist > 0 && (forceRecall || dist < player.pickupRange)) {
          const flySpeed = forceRecall ? (EXP_FLY_SPEED * WAVE_RECALL_SPEED_MULT) : EXP_FLY_SPEED;
          orb.vx = (dx / dist) * flySpeed;
          orb.vy = (dy / dist) * flySpeed;
        }
        orb.x += orb.vx;
        orb.y += orb.vy;
      }
    }

    // 小鱼干吸附与拾取
    function updateCoins(forceRecall = false) {
      const px = player.x + player.size / 2;
      const py = player.y + player.size / 2;
      const COIN_PICKUP_DIST = forceRecall ? 36 : 25;
      const COIN_ATTRACT_DIST = forceRecall ? Number.POSITIVE_INFINITY : 120;
      const COIN_ATTRACT_SPEED = 0.08;  // 吸附加速度
      const COIN_FLY_SPEED = 6;

      // 每帧衰减金币UI弹跳效果
      coinHudPop = Math.max(0, coinHudPop - 0.08);
      
      for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        const dx = px - coin.x;
        const dy = py - coin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // 捡取（玩家于 25px 范围）
        if (dist < COIN_PICKUP_DIST) {
          player.currency += coin.value;
          coins.splice(i, 1);
          coinHudPop = 1;
          SoundEngine.playPickup();
          continue;
        }
        
        // 吸附（平滑曲线）
        if (dist < COIN_ATTRACT_DIST && dist > COIN_PICKUP_DIST) {
          if (forceRecall) {
            const flySpeed = COIN_FLY_SPEED * WAVE_RECALL_SPEED_MULT;
            coin.vx = (dx / dist) * flySpeed;
            coin.vy = (dy / dist) * flySpeed;
          } else {
            coin.vx += (dx / dist) * COIN_ATTRACT_SPEED;
            coin.vy += (dy / dist) * COIN_ATTRACT_SPEED;

            // 速度阻尼，避免瞬间冲刺
            coin.vx *= 0.95;
            coin.vy *= 0.95;
          }
        }
        
        // 移动
        coin.x += coin.vx;
        coin.y += coin.vy;
      }
    }

    // 生成升级菜单选项（随机3个：属性或武器）
    function showLevelUpMenu() {
      const menu = document.getElementById('levelUpMenu');
      menu.innerHTML = '<h3>升级！选择一项强化</h3>';
      
      const options = [];
      const hasWeaponSlot = player.weapons.length < 6;
      const weaponChance = hasWeaponSlot ? 0.4 : 0;  // 有槽位时40%几率出现武器
      
      // 属性选项池（动物主题道具）
      const statOptions = [
        // 新属性道具
        { type: 'lifesteal', name: '蚊子标本 🦟', desc: '吸血 +5%', icon: '🦟', val: 0.05 },
        { type: 'armor', name: '乌龟壳 🐢', desc: '受到的伤害 -1', icon: '🐢', val: 1 },
        { type: 'thorns', name: '刺猬背心 🦔', desc: '反弹 20% 伤害', icon: '🦔', val: 0.2 },
        { type: 'interest', name: '招财猫 🐱', desc: '每波结束获得 10% 利息', icon: '🐱', val: 0.1 },
        // 原有道具
        { type: 'attackSpeed', name: '猫薄荷 🌿', desc: '吸一口，精神抖擞！+10% 攻速', icon: '🌿' },
        { type: 'damage', name: '全新猫抓板 🪵', desc: '磨爪专用，甚至能磨死敌人。+15% 伤害', icon: '🪵' },
        { type: 'pickupRange', name: '激光笔 🔴', desc: '指哪打哪，虽然不知道为什么。+50 射程', icon: '🔴' },
        { type: 'maxHp', name: '高级罐头 🥫', desc: '没有什么是一罐罐头解决不了的。回复 30% HP', icon: '🥫' },
        { type: 'moveSpeed', name: '毛线球 🧶', desc: '追着它跑就对了！+10% 移速', icon: '🧶' }
      ];
      
      // 武器选项池：包括新武器
      const weaponOptions = [
        { type: 'weapon', weaponType: 'PISTOL', name: '左轮', desc: '单发中速中伤' },
        { type: 'weapon', weaponType: 'SHOTGUN', name: '散弹枪', desc: '扇形5发短程' },
        { type: 'weapon', weaponType: 'SMG', name: '冲锋枪', desc: '极快射速小弹' },
        { type: 'weapon', weaponType: 'SALTY_FISH', name: '咸鱼大剑 🐟', desc: '近战扇形攻击' },
        { type: 'weapon', weaponType: 'SCREAMING_CHICKEN', name: '尖叫鸡 🐔', desc: '范围波纹攻击' },
        { type: 'weapon', weaponType: 'MOUSE_BOT', name: '机械鼠群 🐭', desc: '追踪爆炸' }
      ];
      
      // 生成3个选项（随机刷出属性或武器）
      while (options.length < 3) {
        if (Math.random() < weaponChance || (options.length >= 2 && options.every(o => o.type !== 'weapon'))) {
          const w = weaponOptions[Math.floor(Math.random() * weaponOptions.length)];
          const alreadyHas = player.weapons.some(pw => pw.type === w.weaponType);
          const desc = alreadyHas ? '该武器伤害+20%' : (hasWeaponSlot ? '获得新武器' : '槽位已满');
          const opt = { ...w, desc };
          if (!options.some(o => o.type === 'weapon' && o.weaponType === w.weaponType)) {
            options.push(opt);
          }
        }
        const stat = statOptions[Math.floor(Math.random() * statOptions.length)];
        if (!options.some(o => o.type === stat.type)) options.push(stat);
        if (options.length >= 3) break;
      }
      
      // 创建卡片
      options.forEach(opt => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.dataset.upgrade = opt.type;
        if (opt.weaponType) card.dataset.weaponType = opt.weaponType;
        const icon = opt.icon || '';
        card.innerHTML = `<button>${icon} ${opt.name}<br><small style="opacity:0.7">${opt.desc}</small></button>`;
        card.addEventListener('click', () => handleUpgrade(opt));
        menu.appendChild(card);
      });
      
      document.getElementById('levelUpOverlay').classList.add('show');
    }

    // 处理升级选择（动物主题道具效果）
    function handleUpgrade(option) {
      if (option.type === 'weapon') {
        buyOrUpgradeWeapon(option.weaponType);  // 已有+20%伤害，未有则占新槽位
      } else if (option.type === 'attackSpeed') {
        // 猫薄荷 🌿: +10% 攻速
        player.attackSpeedMultiplier *= 1.1;
      } else if (option.type === 'moveSpeed') {
        // 毛线球 🧶: +10% 移速
        player.speed *= 1.1;
      } else if (option.type === 'damage') {
        // 全新猫抓板 🪵: +15% 伤害
        player.damageMultiplier *= 1.15;
      } else if (option.type === 'pickupRange') {
        // 激光笔 🔴: +50 射程（应用到所有武器）
        player.weapons.forEach(weapon => {
          weapon.range += 50;
        });
      } else if (option.type === 'maxHp') {
        // 高级罐头 🥫: 回复 30% HP
        const healAmount = Math.floor(player.maxHp * 0.3);
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
      } else if (option.type === 'lifesteal') {
        // 蚊子标本 🦟: 吸血 +5%
        player.lifesteal += option.val || 0.05;
      } else if (option.type === 'armor') {
        // 乌龟壳 🐢: 受到的伤害 -1
        player.armor += option.val || 1;
      } else if (option.type === 'thorns') {
        // 刺猬背心 🦔: 反弹 20% 伤害
        player.thorns += option.val || 0.2;
      } else if (option.type === 'interest') {
        // 招财猫 🐱: 每波结束获得 10% 利息
        player.interest += option.val || 0.1;
      }
      
      player.exp = 0;
      player.expToNextLevel = Math.floor(player.expToNextLevel * 1.3);
      player.level++;
      player.levelUpFlash = 45;
      showLevelUpText = 90;
      SoundEngine.playPowerUp();
      document.getElementById('levelUpOverlay').classList.remove('show');
      gamePaused = false;
    }

    // 显示死亡结算界面
    function showDeathScreen() {
      const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      document.getElementById('survivalTime').textContent = timeStr;
      document.getElementById('killCount').textContent = gameState.killCount;
      document.getElementById('finalLevel').textContent = player.level;
      canvas.classList.add('dead');
      document.getElementById('deathOverlay').classList.add('show');
    }

    // 显示胜利界面
    function showWinScreen() {
      document.getElementById('winOverlay').classList.add('show');
    }

    // 重置/初始化游戏，供重新开始使用
    function resetGame() {
      // 状态清零：玩家属性
      player.x = canvas.width / 2 - 15;
      player.y = canvas.height / 2 - 15;
      player.hp = 100;
      player.maxHp = 100;
      player.exp = 0;
      player.expToNextLevel = 100;
      player.level = 1;
      player.speed = 3.5;
      player.pickupRange = 165;
      player.attackSpeedMultiplier = 1.0;
      player.damageMultiplier = 1.0;
      player.lifesteal = 0;
      player.armor = 0;
      player.thorns = 0;
      player.interest = 0;
      player.currency = 0;
      player.hurtFlash = 0;
      player.levelUpFlash = 0;
      player.hurtRecoilTime = 0;  // 重置受击反馈时间
      player.lastDamageTime = 0;  // 重置无敌帧
      player.vx = 0;
      player.vy = 0;
      player.lastX = player.x;
      player.lastY = player.y;
      player.lastDirection = 1;
      player.animationTime = 0;
      // 重置精灵动画状态
      currentAnim = 'idle';
      spriteFrameIndex = 0;
      spriteAnimTimer = 0;
      lastAnimTime = Date.now();
      player.weapons = [];
      addWeapon('PISTOL'); // 只有一把初始武器

      // 游戏状态重置
      gameState.startTime = Date.now();
      gameState.currentWave = 1;
      gameState.waveTimer = 60;
      gameState.waveStartTime = Date.now();
      gameState.swarmTriggered = false;
      gameState.enemySpawnMultiplier = 1.0;
      gameState.enemySpeedMultiplier = 1.0;
      gameState.enemyDamageMultiplier = 1.0;
      gameState.killCount = 0;
      gameState.isDead = false;
      gameState.berserk = false;

      // 清理现场
      enemies.length = 0;
      bullets.length = 0;
      enemyBullets.length = 0; // 清理Boss子弹
      expOrbs.length = 0;
      particles.length = 0;  // 新增：清理粒子
      floatingTexts.length = 0; // 清理飘字
      catnipRings.length = 0; // 清理猫薄荷
      yarnBalls.length = 0;  // 清理毛线球
        coins.length = 0;      // 清理金币
      // meleeAttacks 可能未定义，检查一下
      if (typeof meleeAttacks !== 'undefined') meleeAttacks.length = 0;

      // Boss重置
      boss = null;
      lastBossAttack = 0;

      // UI 清理
      gamePaused = false;
      pausedByPlayer = false;
      gameStarted = true;
      showLevelUpText = 0;
      canvas.classList.remove('dead');
      document.getElementById('deathOverlay').classList.remove('show');
      document.getElementById('winOverlay').classList.remove('show');
      document.getElementById('levelUpOverlay').classList.remove('show');
      document.getElementById('shopOverlay').style.display = 'none';
      document.getElementById('bossHealthBarContainer').style.display = 'none';
      document.getElementById('warningText').style.display = 'none';
      document.getElementById('pauseOverlay').classList.remove('show');
      document.getElementById('startOverlay').classList.add('hidden');

      // 计时器重置
      lastEnemySpawn = 0;
      lastWaveCheck = 0;
      lastEliteSpawn = Date.now();
      warningTimer = 0;
      waveCleanupActive = false;
      waveCleanupStart = 0;
      godMode = false;
      godModeBuffer = '';

      // 确保游戏循环正在运行
      if (typeof animationId !== 'undefined') cancelAnimationFrame(animationId);
      gameLoop();
    }

    // 重新开始按钮事件
    document.getElementById('restartBtn').addEventListener('click', () => {
      SoundEngine.resume();
      resetGame();
    });
    document.getElementById('winRestartBtn').addEventListener('click', () => {
      SoundEngine.resume();
      resetGame();
    });

    // 获取离玩家最近的敌人（用于眼睛朝向）
    function getNearestEnemy() {
      let nearest = null;
      let minD = Infinity;
      const px = player.x + player.size / 2;
      const py = player.y + player.size / 2;
      enemies.forEach(e => {
        const dx = (e.x + e.radius) - px;
        const dy = (e.y + e.radius) - py;
        const d = dx * dx + dy * dy;
        if (d < minD) { minD = d; nearest = e; }
      });
      return nearest;
    }

    // 脚底阴影：在实体底部绘制压扁的半透明椭圆
    function drawShadow(x, y, size) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y + size / 2, size * 0.8, size * 0.8 * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRoundedRect(x, y, width, height, radius) {
      const r = Math.min(radius, width * 0.5, height * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function drawWoodFloor() {
      const plankW = 78;
      ctx.fillStyle = '#3a271b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let x = 0; x < canvas.width; x += plankW) {
        const idx = Math.floor(x / plankW);
        const plankColor = idx % 2 === 0 ? '#4a3224' : '#3f2a1e';
        ctx.fillStyle = plankColor;
        ctx.fillRect(x, 0, plankW, canvas.height);

        // 木板接缝
        ctx.strokeStyle = 'rgba(25, 14, 10, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();

        // 长条木纹
        for (let y = 0; y < canvas.height; y += 14) {
          const wave = Math.sin((y + idx * 17) * 0.08) * 3;
          ctx.fillStyle = idx % 2 === 0 ? 'rgba(145, 97, 60, 0.18)' : 'rgba(120, 80, 52, 0.16)';
          ctx.fillRect(x + 8 + wave, y, plankW - 16, 1);
        }
      }

      // 额外深色纵向纹理，强化复古地板质感
      ctx.fillStyle = 'rgba(26, 14, 10, 0.12)';
      for (let x = 18; x < canvas.width; x += 52) {
        const w = 1 + ((x / 52) % 3);
        ctx.fillRect(x, 0, w, canvas.height);
      }
    }

    // 绘制玩家：精灵表动画 + 脚底阴影 + 动态反馈
    function drawPlayer() {
      const now = Date.now();
      player.animationTime = now;

      // ========== 计算速度与运动状态 ==========
      const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      const isMoving = speed > 0.5;

      // ========== 精灵表帧更新 ==========
      const newAnim = isMoving ? 'run' : 'idle';
      if (newAnim !== currentAnim) {
        currentAnim = newAnim;
        spriteFrameIndex = 0;
        spriteAnimTimer = 0;
      }

      const animDef = SPRITE[currentAnim];
      const dt = now - lastAnimTime;
      lastAnimTime = now;
      spriteAnimTimer += dt;

      const frameDuration = 1000 / animDef.fps;
      if (spriteAnimTimer >= frameDuration) {
        spriteFrameIndex = (spriteFrameIndex + 1) % animDef.frames;
        spriteAnimTimer -= frameDuration;
      }

      // ========== 动画附加效果 ==========
      let bobY = 0;
      let shakeX = 0;
      let scaleX = 1.0;
      let scaleY = 1.0;

      if (isMoving) {
        const speedNorm = Math.min(speed / Math.max(0.001, player.speed), 1.0);
        scaleX = 1.0 + speedNorm * 0.02;
        scaleY = 1.0 - speedNorm * 0.015;
        bobY = Math.max(0, Math.sin(now / 200) * 1.0 * speedNorm);
      } else {
        const breathe = Math.sin(now / 300);
        scaleY = 0.99 + ((breathe + 1) / 2) * 0.02;
        scaleX = 1.01 - ((breathe + 1) / 2) * 0.02;
        bobY = breathe * 0.8;
      }

      // 受击反馈
      if (player.hurtRecoilTime > 0) {
        const recoilProgress = 1.0 - (player.hurtRecoilTime / 20);
        const shrink = Math.sin(recoilProgress * Math.PI) * 0.08;
        scaleX *= (1.0 - shrink);
        scaleY *= (1.0 - shrink);
        shakeX = Math.sin(player.hurtRecoilTime * 0.3) * 5;
      }

      // ========== 绘制底部阴影 ==========
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(player.x + player.size / 2, player.y + player.size * 1.1, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ========== 绘制精灵 ==========
      ctx.save();

      const centerX = player.x + player.size / 2 + shakeX;
      const centerY = player.y + player.size / 2 + bobY;

      ctx.translate(centerX, centerY);
      // 镜像翻转：精灵表默认朝右，lastDirection=-1 时翻转
      ctx.scale(scaleX * player.lastDirection, scaleY);

      if (godMode) {
        ctx.shadowColor = 'rgba(250, 204, 21, 0.95)';
        ctx.shadowBlur = 18;
      }

      // 受击闪白：叠加白色半透明
      if (player.hurtFlash > 0) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(player.hurtFlash * 0.8);
      }

      const drawSize = 52; // 绘制尺寸（比碰撞体大一些，看起来更饱满）
      const halfDraw = drawSize / 2;

      // 从精灵表中裁切当前帧
      if (spriteReady) {
        const frameW = catSpriteSheet.width / SPRITE_COLS;
        const frameH = catSpriteSheet.height / SPRITE_ROWS;
        const srcX = spriteFrameIndex * frameW;
        const srcY = animDef.row * frameH;
        ctx.drawImage(
          catSpriteSheet,
          srcX, srcY, frameW, frameH,            // 源矩形：精灵表中的一帧
          -halfDraw, -halfDraw, drawSize, drawSize // 目标矩形
        );
      } else {
        // 精灵表加载中的 fallback
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-halfDraw, -halfDraw, drawSize, drawSize);
      }

      ctx.restore();
    }

    // 碰撞检测：敌人 vs 玩家 + Boss子弹 vs 玩家
    function checkEnemyPlayerCollision() {
      enemies.forEach(enemy => {
        const dx = (player.x + player.size / 2) - (enemy.x + enemy.radius);
        const dy = (player.y + player.size / 2) - (enemy.y + enemy.radius);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < (player.size / 2 + enemy.radius)) {
          // 无敌帧检查：受伤后短时间内不再受伤
          const now = Date.now();
          if (now - player.lastDamageTime < player.iFrameDuration) return;

          // 玩家受伤，伤害随波次提升
          let dmg = 10 * gameState.enemyDamageMultiplier;
          player.hurtRecoilTime = 20;  // 触发受击弹回动画

          // 护甲减伤
          dmg = Math.max(1, dmg - player.armor);

          if (!godMode) {
            player.hp -= dmg;
            player.hurtFlash = 20;
            player.lastDamageTime = now; // 记录受伤时间
            screenShake = Math.max(screenShake, 15);
          }
          
          // 反伤逻辑
          if (player.thorns > 0) {
            const thornsDmg = player.damageMultiplier * player.thorns;
            enemy.hp -= thornsDmg;
            
            // 反伤视觉反馈：发射8个尖刺
            for (let k = 0; k < 8; k++) {
              const angle = (k / 8) * Math.PI * 2;
              const speed = 8;
              particles.push({
                x: player.x + player.size / 2,
                y: player.y + player.size / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1.0,
                size: 4,
                color: '#ff0000'
              });
            }
            
            if (enemy.hp <= 0) {
              // 敌人被反伤杀死
              let orbExp = 15;
              for (let k = 0; k < 8; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 6 + 2;
                particles.push({
                  x: enemy.x + enemy.radius,
                  y: enemy.y + enemy.radius,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  alpha: 1.0,
                  size: Math.random() * 4 + 3,
                  color: enemy.color || '#fff'
                });
              }
              expOrbs.push({
                x: enemy.x + enemy.radius,
                y: enemy.y + enemy.radius,
                radius: 10,
                exp: orbExp,
                vx: 0,
                vy: 0
              });
              SoundEngine.playExplosion();
              gameState.killCount++;
              enemies.splice(enemies.indexOf(enemy), 1);
              
                          // 金币掉落（每个敌人掉1-3枚）
                          const coinCount = Math.min(3, Math.ceil(enemy.maxHp / 20));
                          for (let k = 0; k < coinCount; k++) {
                            coins.push({
                              x: enemy.x + enemy.radius + (Math.random() - 0.5) * 20,
                              y: enemy.y + enemy.radius + (Math.random() - 0.5) * 20,
                              vx: 0,
                              vy: 0,
                              radius: 4,
                              value: 1
                            });
                          }
            }
          }
          
          if (player.hp <= 0) {
            player.hp = 0;
            gameState.isDead = true;
            gamePaused = true;
            showDeathScreen();
          }
        }
      });

      // Boss子弹碰撞
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        const dx = (player.x + player.size / 2) - bullet.x;
        const dy = (player.y + player.size / 2) - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < (player.size / 2 + bullet.radius)) {
          let dmg = bullet.damage || 20; // Boss子弹伤害
          
          // 护甲减伤
          dmg = Math.max(1, dmg - player.armor);
          
          if (!godMode) {
            player.hp -= dmg;
            player.hurtFlash = 20;
            player.hurtRecoilTime = 20;  // 触发受击弹回动画
            screenShake = Math.max(screenShake, 20);
          }
          enemyBullets.splice(i, 1);

          if (player.hp <= 0) {
            player.hp = 0;
            gameState.isDead = true;
            gamePaused = true;
            showDeathScreen();
          }
        }
      }
      
      // Boss本体碰撞：玩家碰到Boss受到大量伤害
      if (boss) {
        const dx = (player.x + player.size / 2) - (boss.x + boss.radius);
        const dy = (player.y + player.size / 2) - (boss.y + boss.radius);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < (player.size / 2 + boss.radius)) {
          // 无敌帧检查
          const bossNow = Date.now();
          if (bossNow - player.lastDamageTime < player.iFrameDuration) return;

          let dmg = 50; // Boss本体碰撞伤害

          // 护甲减伤
          dmg = Math.max(1, dmg - player.armor);

          if (!godMode) {
            player.hp -= dmg;
            player.hurtFlash = 20;
            player.hurtRecoilTime = 20;  // 触发受击弹回动画
            player.lastDamageTime = bossNow; // 记录受伤时间
            screenShake = Math.max(screenShake, 25);
          }
          
          // 反伤逻辑（对Boss）
          if (player.thorns > 0) {
            const thornsDmg = player.damageMultiplier * player.thorns;
            boss.hp -= thornsDmg;
            
            // 反伤视觉反馈
            for (let k = 0; k < 8; k++) {
              const angle = (k / 8) * Math.PI * 2;
              const speed = 8;
              particles.push({
                x: player.x + player.size / 2,
                y: player.y + player.size / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1.0,
                size: 4,
                color: '#ff0000'
              });
            }
          }
          
          // 击退玩家
          if (distance > 0) {
            const knockback = 30;
            player.x += (dx / distance) * knockback;
            player.y += (dy / distance) * knockback;
            player.x = Math.max(0, Math.min(canvas.width - player.size, player.x));
            player.y = Math.max(0, Math.min(canvas.height - player.size, player.y));
          }
          
          if (player.hp <= 0) {
            player.hp = 0;
            gameState.isDead = true;
            gamePaused = true;
            showDeathScreen();
          }
        }
      }
    }

    function update() {
      if (gamePaused || gameState.isDead) {
        if (player.levelUpFlash > 0) player.levelUpFlash--;
        if (showLevelUpText > 0) showLevelUpText--;
        return;
      }
      
      // 更新波次
      updateWave();

      // updateWave 期间可能触发结算并暂停
      if (gamePaused || gameState.isDead) {
        if (player.levelUpFlash > 0) player.levelUpFlash--;
        if (showLevelUpText > 0) showLevelUpText--;
        return;
      }

      // 波次结算吸附阶段：资源 5 倍速回收后再进入商店
      if (waveCleanupActive) {
        updateExpOrbs(true);
        updateCoins(true);
        updateFloatingTexts();

        if ((expOrbs.length === 0 && coins.length === 0) || (Date.now() - waveCleanupStart > WAVE_RECALL_MAX_MS)) {
          finalizeWaveEnd();
        }

        if (player.hurtFlash > 0) player.hurtFlash--;
        if (player.levelUpFlash > 0) player.levelUpFlash--;
        if (showLevelUpText > 0) showLevelUpText--;
        return;
      }
      
      // 狂暴时间判定（5分钟）
      const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
      if (elapsed >= 300 && !gameState.berserk) {
        gameState.berserk = true;
        gameState.enemySpeedMultiplier *= 2;
        // 已存在敌人也获加成并缩小
        enemies.forEach(e => { e.speed *= 2; e.size *= 0.7; });
      }

      // Boss攻击逻辑已在updateBoss()中处理

      // 玩家移动
      // 记录移动前的位置（用于计算速度）
      const prevX = player.x;
      const prevY = player.y;
      
      // 移动逻辑
      const movingLeft = keys.a;
      const movingRight = keys.d;
      if (keys.w) player.y -= player.speed;
      if (keys.s) player.y += player.speed;
      if (movingLeft) player.x -= player.speed;
      if (movingRight) player.x += player.speed;

      player.x = Math.max(0, Math.min(canvas.width - player.size, player.x));
      player.y = Math.max(0, Math.min(canvas.height - player.size, player.y));
      
      // 计算速度向量（用于动画）
      player.vx = player.x - prevX;
      player.vy = player.y - prevY;
      
      // 更新方向（根据水平移动）
      if (movingLeft) player.lastDirection = -1;
      else if (movingRight) player.lastDirection = 1;
      
      // 如果受击，递减recoil时间
      if (player.hurtRecoilTime > 0) player.hurtRecoilTime--;

      // ---------- 更新逻辑区 ----------
      spawnEnemy();
      updateWeapons();
      updateEnemies();
      updateCatnips();        // 猫薄荷光环伤害
      updateYarnBalls();      // 毛线球投掷和爆炸
      updateBoss();           // Boss 移动 + 发射子弹
      updateBullets();
      updateEnemyBullets();   // Boss 子弹移动（必须调用否则子弹不动）
      updateParticles();      // 爆炸粒子（不调用则爆炸效果不出）

      // ---------- 碰撞检测区 ----------
      checkBulletEnemyCollision();  // 子弹 vs 普通敌人
      checkBossCollision();         // 子弹 vs Boss（关键：放在敌人碰撞附近）
      checkEnemyPlayerCollision();  // 敌人/Boss子弹 vs 玩家
      updateExpOrbs(false);
      updateCoins(false);
      updateFloatingTexts();   // 伤害飘字（不调用则飘字不出）

      if (player.hurtFlash > 0) player.hurtFlash--;
      if (player.levelUpFlash > 0) player.levelUpFlash--;
      if (showLevelUpText > 0) showLevelUpText--;
    }

    function draw() {
      // 背景：复古木质地板
      drawWoodFloor();
      // 画布抖动（在清空背景后，网格绘制前）
      if (screenShake > 0) {
        ctx.save();
        const dx = (Math.random() * 2 - 1) * screenShake;
        const dy = (Math.random() * 2 - 1) * screenShake;
        ctx.translate(dx, dy);
      }

      // 警告灯效
      if (warningTimer > 0) {
        warningTimer--;
        // 屏幕边缘红色闪烁
        const alpha = 0.4 + 0.3 * Math.sin(Date.now() / 100);
        ctx.strokeStyle = `rgba(255,0,0,${alpha})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        // 文本
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WARNING: BOSS APPROACHING', canvas.width / 2, 60);
      }

        // 顶部HUD：XP 顶栏（满宽 8px）
        const xpBarX = 0;
        const xpBarY = 0;
        const xpBarW = canvas.width;
        const xpBarH = 8;
        const xpRatio = Math.min(1, player.exp / player.expToNextLevel);
        ctx.fillStyle = 'rgba(16, 10, 30, 0.92)';
        ctx.fillRect(xpBarX, xpBarY, xpBarW, xpBarH);
        const xpGradient = ctx.createLinearGradient(0, 0, xpBarW, 0);
        xpGradient.addColorStop(0, '#22c55e');
        xpGradient.addColorStop(0.55, '#4ade80');
        xpGradient.addColorStop(1, '#86efac');
        ctx.save();
        ctx.shadowColor = 'rgba(74, 222, 128, 0.9)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = xpGradient;
        ctx.fillRect(xpBarX, xpBarY, xpBarW * xpRatio, xpBarH);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(xpBarX + 0.5, xpBarY + 0.5, xpBarW - 1, xpBarH - 1);

        // 左上资源区：深色半透明圆角背景
        const coinPanelX = 10;
        const coinPanelY = 14;
        const coinPanelW = 220;
        const coinPanelH = 64;
        ctx.save();
        drawRoundedRect(coinPanelX, coinPanelY, coinPanelW, coinPanelH, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const row1Y = coinPanelY + 20;
        const row2Y = coinPanelY + 46;
        ctx.font = 'bold 20px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('🐟 x', coinPanelX + 12, row1Y);

        const coinScale = 1 + coinHudPop * 0.16;
        const coinValueX = coinPanelX + 82;
        const coinValueY = row1Y;
        ctx.save();
        ctx.translate(coinValueX, coinValueY);
        ctx.scale(coinScale, coinScale);
        ctx.font = 'bold 24px "Trebuchet MS", "Segoe UI", sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(String(player.currency), 0, 0);
        ctx.fillStyle = '#facc15';
        ctx.fillText(String(player.currency), 0, 0);
        ctx.restore();

        ctx.font = 'bold 16px "Trebuchet MS", "Segoe UI", sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(`🌿 Level ${player.level}`, coinPanelX + 12, row2Y);
        ctx.fillStyle = '#4ade80';
        ctx.fillText(`🌿 Level ${player.level}`, coinPanelX + 12, row2Y);

        // HP条（下移，避免与XP顶栏冲突）
        const hpBarY = coinPanelY + coinPanelH + 10;
        const hpBarW = 220;
        const hpBarH = 10;
        const hpBarX = 10;
        ctx.fillStyle = 'rgba(20, 18, 35, 0.95)';
        ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH);
        const hpPercent = Math.max(0, player.hp / player.maxHp);
        ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
        ctx.fillRect(hpBarX, hpBarY, hpBarW * hpPercent, hpBarH);
        ctx.strokeStyle = '#c4b5fd';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH);
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`HP: ${Math.ceil(player.hp)}/${player.maxHp}`, hpBarX + 2, hpBarY + hpBarH + 10);

      // Boss血条
      if (boss) {
        const bossFill = document.getElementById('bossHealthFill');
        const hpPercent = Math.max(0, boss.hp / boss.maxHp);
        bossFill.style.width = (hpPercent * 100) + '%';
      }

      // 武器槽位显示（屏幕右上角）
      const slotSize = 24;
      const slotGap = 4;
      const slotsStartX = canvas.width - (slotSize * 6 + slotGap * 5) - 10;
      const slotsY = 10;
      ctx.font = '9px "Segoe UI", system-ui, sans-serif';  // 减小从 10px 到 9px
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('武器槽:', slotsStartX - 50, slotsY + 16);
      for (let i = 0; i < 6; i++) {
        const x = slotsStartX + i * (slotSize + slotGap);
        ctx.fillStyle = i < player.weapons.length ? '#a78bfa' : 'rgba(167, 139, 250, 0.2)';
        ctx.fillRect(x, slotsY, slotSize, slotSize);
        ctx.strokeStyle = '#c4b5fd';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, slotsY, slotSize, slotSize);
        if (i < player.weapons.length) {
          const w = player.weapons[i];
          ctx.fillStyle = '#fff';
          ctx.font = '11px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label = w.type === 'PISTOL' ? 'P' : w.type === 'SHOTGUN' ? 'S' : 'M';
          ctx.fillText(label, x + slotSize / 2, slotsY + slotSize / 2);
          ctx.textAlign = 'left';
        }
      }

      // 攻击半径圈已隐藏（不显示）

      // 构建渲染队列进行 Y-Sorting（玩家、敌人、经验球、金币）
      const renderSize = 40; // 玩家显示尺寸
      const renderList = [];

      // 渲染剔除函数
      const isOnScreen = (x, y, size) => {
        return x + size > -VIEW_CULL_BUFFER && 
               x < canvas.width + VIEW_CULL_BUFFER && 
               y + size > -VIEW_CULL_BUFFER && 
               y < canvas.height + VIEW_CULL_BUFFER;
      };

      enemies.forEach(e => {
        if (isOnScreen(e.x, e.y, e.radius * 2)) {
          renderList.push({ type: 'enemy', obj: e, sortY: e.y + e.radius, size: e.radius * 2 });
        }
      });
      expOrbs.forEach(o => {
        if (isOnScreen(o.x, o.y, o.radius * 2)) {
          renderList.push({ type: 'exp', obj: o, sortY: o.y + o.radius, size: o.radius * 2 });
        }
      });
      coins.forEach(coin => {
        if (isOnScreen(coin.x, coin.y, coin.radius * 2)) {
          renderList.push({ type: 'coin', obj: coin, sortY: coin.y + coin.radius, size: coin.radius * 2 });
        }
      });
      renderList.push({ type: 'player', obj: player, sortY: player.y + player.size / 2, size: renderSize });
      if (boss && isOnScreen(boss.x, boss.y, boss.size)) {
        renderList.push({ type: 'boss', obj: boss, sortY: boss.y + boss.radius, size: boss.size });
      }

      renderList.sort((a, b) => a.sortY - b.sortY);

      // 绘制猫薄荷光环（半透明圆环，有呼吸效果）
      catnipRings.forEach(ring => {
        const elapsed = Date.now() - ring.createdAt;
        const progress = 1 - (elapsed / ring.lifetime);
        const alpha = 0.1 + 0.1 * Math.sin(elapsed / 100); // 呼吸效果
        const radius = ring.radius * (0.8 + 0.2 * Math.sin(elapsed / 100));
        
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha * progress);
        ctx.fillStyle = ring.color;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      renderList.forEach(item => {
        if (item.type === 'enemy') {
          const enemy = item.obj;
          drawShadow(enemy.x, enemy.y, enemy.radius * 2);
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.radius, enemy.y + enemy.radius, enemy.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // 受击闪白效果
          if (enemy.hurtFlash > 0) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(enemy.x + enemy.radius, enemy.y + enemy.radius, enemy.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        } else if (item.type === 'exp') {
          const orb = item.obj;
          const t = Date.now() / 220;
          const i = expOrbs.indexOf(orb);
          const breath = 1 + 0.16 * Math.sin(t + i * 0.7);
          const r = orb.radius * breath;
          const leafTilt = Math.sin(t + i) * 0.35;

          ctx.save();
          ctx.translate(orb.x, orb.y);
          ctx.rotate(leafTilt);
          ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t + i * 0.5);
          ctx.shadowColor = 'rgba(74, 222, 128, 0.85)';
          ctx.shadowBlur = 8;
          // 猫薄荷叶片
          ctx.fillStyle = '#4ade80';
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.9, r * 0.55, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
          // 叶脉
          ctx.strokeStyle = 'rgba(236, 253, 245, 0.9)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-r * 0.45, r * 0.22);
          ctx.lineTo(r * 0.45, -r * 0.22);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (item.type === 'player') {
          drawPlayer();
        } else if (item.type === 'coin') {
          const coin = item.obj;
          // 小鱼干掉落视觉：橙黄色鱼形 + 白色描边
          const fishR = coin.radius;
          ctx.save();
          ctx.translate(coin.x, coin.y);
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.ellipse(0, 0, fishR * 1.1, fishR * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();

          // 鱼尾
          ctx.beginPath();
          ctx.moveTo(-fishR * 1.05, 0);
          ctx.lineTo(-fishR * 1.8, -fishR * 0.5);
          ctx.lineTo(-fishR * 1.8, fishR * 0.5);
          ctx.closePath();
          ctx.fillStyle = '#fb923c';
          ctx.fill();

          // 白描边
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, 0, fishR * 1.1, fishR * 0.65, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-fishR * 1.05, 0);
          ctx.lineTo(-fishR * 1.8, -fishR * 0.5);
          ctx.lineTo(-fishR * 1.8, fishR * 0.5);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        } else if (item.type === 'boss') {
          const b = item.obj;
          const jitterX = b.renderJitterX || 0;
          const jitterY = b.renderJitterY || 0;
          const cx = b.x + b.radius + jitterX;
          const cy = b.y + b.radius + jitterY;

          drawShadow(b.x + jitterX, b.y + jitterY, b.size);

          // 披风（红色半透明梯形）
          ctx.fillStyle = 'rgba(220, 38, 38, 0.58)';
          ctx.beginPath();
          ctx.moveTo(cx - b.radius * 0.5, cy - b.radius * 0.2);
          ctx.lineTo(cx + b.radius * 0.5, cy - b.radius * 0.2);
          ctx.lineTo(cx + b.radius * 0.82, cy + b.radius * 0.88);
          ctx.lineTo(cx - b.radius * 0.82, cy + b.radius * 0.88);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(cx, cy, b.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.stroke();

          // 皇冠（三角形组合）
          if (b.isKing || gameState.currentWave >= 10) {
            const crownY = cy - b.radius - 14;
            const crownW = b.radius * 1.1;
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(cx - crownW * 0.5, crownY + 18);
            ctx.lineTo(cx - crownW * 0.3, crownY + 2);
            ctx.lineTo(cx, crownY + 16);
            ctx.lineTo(cx + crownW * 0.3, crownY + 2);
            ctx.lineTo(cx + crownW * 0.5, crownY + 18);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      });

      // 绘制毛线球（彩色圆形投掷物体）
      yarnBalls.forEach(ball => {
        ctx.save();
        ctx.fillStyle = ball.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      });

      // 子弹始终绘制在最上层（动物主题：用emoji代替圆形）- 添加渲染剔除
      bullets.forEach(bullet => {
        // 渲染剔除
        if (!isOnScreen(bullet.x, bullet.y, 50)) return;
        
        // 根据武器类型选择emoji和绘制方式
        let emoji = '🐟'; // 默认：鱼骨头
        let size = 20;
        
        if (bullet.weaponType === 'PISTOL') {
          emoji = '🐟'; // 鱼骨头
        } else if (bullet.weaponType === 'SHOTGUN') {
          emoji = '🐾'; // 猫爪印
        } else if (bullet.weaponType === 'SMG') {
          emoji = '🧶'; // 毛线球
        } else if (bullet.weaponType === 'SALTY_FISH') {
          emoji = '🐟'; // 咸鱼大剑（巨大）
          size = 40;
        } else if (bullet.weaponType === 'SCREAMING_CHICKEN') {
          emoji = '🐔'; // 尖叫鸡
          size = 30;
        } else if (bullet.weaponType === 'MOUSE_BOT') {
          emoji = '🐭'; // 机械鼠
          size = 18;
        }
        
        // 近战武器：绘制扇形剑气
        if (bullet.isMelee) {
          ctx.save();
          ctx.translate(bullet.x, bullet.y);
          ctx.rotate(bullet.startAngle);
          ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, bullet.range, 0, bullet.endAngle - bullet.startAngle);
          ctx.closePath();
          ctx.fill();
          ctx.font = `${size}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, bullet.range / 2, 0);
          ctx.restore();
        }
        // AOE武器：绘制波纹
        else if (bullet.isAOE) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, bullet.currentRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = `${size}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, bullet.x, bullet.y);
          ctx.restore();
        }
        // 普通/追踪武器：绘制emoji
        else {
          ctx.save();
          ctx.font = `${size}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, bullet.x, bullet.y);
          ctx.restore();
        }
      });

      // Boss子弹（红色大子弹）- 添加渲染剔除
      enemyBullets.forEach(bullet => {
        if (!isOnScreen(bullet.x, bullet.y, bullet.radius + 10)) return;
        
        if (bullet.isTracking) {
          // 追踪球：紫色光晕
          ctx.fillStyle = 'rgba(147, 51, 234, 0.6)';
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, bullet.radius + 3, 0, Math.PI * 2);
          ctx.fill();
        }
        // Boss红色大子弹
        ctx.fillStyle = bullet.color || (bullet.isTracking ? '#d946ef' : '#ff0000');
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        // 红色光晕效果
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // 新增：绘制粒子
      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 新增：绘制伤害飘字
      if (floatingTexts.length > 0) {
        ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < floatingTexts.length; i++) {
          const ft = floatingTexts[i];
          if (!isOnScreen(ft.x, ft.y, 0)) continue;
          ctx.globalAlpha = ft.alpha;
          ctx.fillStyle = ft.color || '#fff';
          ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;
      }

      // 升级时屏幕中央 "LEVEL UP!"
      if (showLevelUpText > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, showLevelUpText / 30);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LEVEL UP!', canvas.width / 2, canvas.height / 2);
        ctx.restore();
      }
      // 恢复画布（若之前进行了 screenShake 的 translate），并衰减震动强度
      if (screenShake > 0) {
        ctx.restore();
        screenShake *= 0.9;
        if (screenShake < 0.05) screenShake = 0;
      }
    }

    // ========== 暂停系统 ==========
    function togglePause() {
      // 不在升级选择/商店/波次结算时才允许手动暂停
      if (document.getElementById('levelUpOverlay').classList.contains('show')) return;
      if (document.getElementById('shopOverlay').style.display === 'flex') return;
      if (waveCleanupActive) return;

      pausedByPlayer = !pausedByPlayer;
      if (pausedByPlayer) {
        gamePaused = true;
        document.getElementById('pauseOverlay').classList.add('show');
      } else {
        gamePaused = false;
        document.getElementById('pauseOverlay').classList.remove('show');
      }
    }

    // 恢复按钮
    document.getElementById('resumeBtn').addEventListener('click', () => {
      if (pausedByPlayer) togglePause();
    });

    // ========== 开始界面 ==========
    document.getElementById('startBtn').addEventListener('click', () => {
      document.getElementById('startOverlay').classList.add('hidden');
      gameStarted = true;
      gamePaused = false;
      SoundEngine.resume();
      gameState.startTime = Date.now();
      gameState.waveStartTime = Date.now();
    });

    let animationId;
    function gameLoop() {
      try {
        if (gameStarted) {
          update();
        }
        draw();
        animationId = requestAnimationFrame(gameLoop);
      } catch (error) {
        console.error('Game loop error:', error);
        cancelAnimationFrame(animationId);
      }
    }

    // 游戏初始为暂停状态，等待开始按钮
    gamePaused = true;

    // 非阻塞启动：立即开始游戏循环，图片未加载时画彩色方块
    gameLoop();
