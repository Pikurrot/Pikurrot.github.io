// Tetris + Snake background animation
// Ported from Python version in temp.py to Canvas 2D

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
const canvas = document.getElementById('bg');
const ctx = canvas.getContext('2d', { alpha: true });

// Dynamic view/layout config (computed on resize)
let gridW = 30;
let gridH = 22;
let CELL = 28; // px per cell (can be fractional)
const MARGIN = 2; // px gap between cells
let padX = 20; // dynamic padding to center grid
let padY = 20;

// Colors (light mode)
const BG_COLOR = '#ffffff';
const EMPTY_COLOR = '#f1f3f5';
const BLOCK_COLOR = '#a8b2c1';
const SNAKE_COLOR = '#1e824c';
const SNAKE_TAIL = '#3db37a';
const APPLE_COLOR = '#d12f2f';
const FALLING_PIECE_COLOR = '#b9c4d8';

// Transparency controls
const ALPHA_BG = 0.10;         // background board fill
const ALPHA_BLOCK = 0.10;      // static placed blocks
const ALPHA_PARTICLE = 0.1;   // particles
const ALPHA_SNAKE = 0.40;      // snake segments
const ALPHA_APPLE = 0.40;      // apple
// Falling piece alpha range by proximity to landing
const FALLING_ALPHA_FAR = 0.03;   // when far from landing
const FALLING_ALPHA_NEAR = 0.12;           // when very close to landing

// Dynamic distraction reduction state
let focusDampen = 1.0; // multiplies alphas and speeds when user interacts with content
let scrollDampen = 1.0; // multiplies alphas when page is scrolled

// Logic config
const SNAKE_MIN_BUILD_ROWS = 6;
const SNAKE_MAX_LEN = 4;
const SNAKE_STEP_MS_SLOW = 320;
const SNAKE_STEP_MS_FAST = 10;
// Controls how strongly snake speed increases with number of filled rows
// 1.0 = default linear; <1.0 = gentler speed-up; >1.0 = stronger speed-up
const SNAKE_SPEED_RATE = 3.0;
const PIECE_GRAVITY_MS_DEFAULT = 60;
const GRAVITY_MIN_MS = 10;
const BALANCE_INTERVAL_MS = 3000; // 3 seconds (how often to balance the world speed with the snake speed)
const AUTO_BALANCE = true;
const NEXT_PREVIEW = 5;
let maxConcurrentPieces = 10; // dynamic based on world size

// Global rates (user-tunable)
// Bigger map in HEIGHT => faster falling: ms change per row relative to baseline height
const HEIGHT_TO_FALL_MS_RATE = 2; // increase to speed up more with height, decrease to soften
// Bigger map in WIDTH => more concurrent pieces: pieces per extra column relative to baseline width
const WIDTH_TO_CONCURRENCY_RATE = 0.3; // increase to allow more pieces as width grows
// Baselines for world size scaling
const BASE_W_BASELINE = 20;
const BASE_H_BASELINE = 22;
// Snake speed scaling with world size (area). 0 = no scaling; >0 increases speed on larger worlds.
const SNAKE_WORLD_SPEED_RATE = 0.6;
// Block size scaling with viewport: larger screens => larger blocks (fewer cells)
const BASE_VIEWPORT_W = 1280;
const BASE_VIEWPORT_H = 720;
const BASE_MIN_CELL_PX = 16; // min cell size at baseline viewport
const CELL_SIZE_SCALE_RATE = 1; // 0=no change, 1=scale min cell linearly with sqrt(area)
const MAX_CELL_PX = 64; // clamp for very large screens

// Particles
const PARTICLE_GRAVITY = 0.0008;
const ROW_PARTICLES_PER_BLOCK = 3;
const APPLE_PARTICLES = 18;

// AI Weights
const AI_WEIGHTS = {
  aggregate_height: -0.510066,
  complete_lines: 0.760666,
  holes: -0.35663,
  bumpiness: -0.184483,
  // Additional weights to discourage tall towers and reward immediate line completion
  max_height: -0.350, // higher means more penalty for tall towers
  top_heavy: -0.120, // higher means more penalty for top-heavy towers
  lines_delta: 0.400, // higher means more penalty for lines completed later than before
};

// Shapes
const SHAPES = {
  I: [
    [ [0,0],[1,0],[2,0],[3,0] ],
    [ [1,-1],[1,0],[1,1],[1,2] ],
  ],
  O: [
    [ [0,0],[1,0],[0,1],[1,1] ],
  ],
  T: [
    [ [0,0],[1,0],[2,0],[1,1] ],
    [ [1,-1],[1,0],[1,1],[0,0] ],
    [ [1,-1],[0,0],[1,0],[2,0] ],
    [ [1,-1],[1,0],[1,1],[2,0] ],
  ],
  S: [
    [ [1,0],[2,0],[0,1],[1,1] ],
    [ [1,-1],[1,0],[2,0],[2,1] ],
  ],
  Z: [
    [ [0,0],[1,0],[1,1],[2,1] ],
    [ [2,-1],[1,0],[2,0],[1,1] ],
  ],
  J: [
    [ [0,0],[0,1],[1,0],[2,0] ],
    [ [1,-1],[2,-1],[1,0],[1,1] ],
    [ [0,1],[1,1],[2,1],[2,0] ],
    [ [1,-1],[1,0],[0,1],[1,1] ],
  ],
  L: [
    [ [2,0],[0,0],[1,0],[2,1] ],
    [ [1,-1],[1,0],[1,1],[2,1] ],
    [ [0,0],[1,1],[2,1],[0,1] ],
    [ [0,-1],[1,-1],[1,0],[1,1] ],
  ],
};
const SHAPE_KEYS = Object.keys(SHAPES);

// Helpers
function emptyGrid() {
  return Array.from({ length: gridH }, () => Array(gridW).fill(0));
}
function inBounds(x, y) {
  return x >= 0 && x < gridW && y >= 0 && y < gridH;
}
function countNonEmptyRows(grid) {
  let c = 0;
  for (let y = 0; y < gridH; y++) {
    let any = false;
    for (let x = 0; x < gridW; x++) if (grid[y][x]) { any = true; break; }
    if (any) c++;
  }
  return c;
}
function lowestNonEmptyRow(grid) {
  for (let y = gridH - 1; y >= 0; y--) {
    for (let x = 0; x < gridW; x++) if (grid[y][x]) return y;
  }
  return null;
}
function collides(grid, shape, sx, sy) {
  for (const [dx, dy] of shape) {
    const x = sx + dx, y = sy + dy;
    if (!inBounds(x, y)) return true;
    if (grid[y][x] === 1) return true;
  }
  return false;
}
function shapeBounds(shape) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [dx, dy] of shape) {
    if (dx < minx) minx = dx; if (dx > maxx) maxx = dx;
    if (dy < miny) miny = dy; if (dy > maxy) maxy = dy;
  }
  return [minx, maxx, miny, maxy];
}
function validXRangeForShape(shape) {
  const [minx, maxx] = shapeBounds(shape);
  const sxMin = -minx;
  const sxMax = gridW - 1 - maxx;
  return [sxMin, sxMax];
}
function dropYForShape(grid, shape, sx) {
  const [, , miny] = shapeBounds(shape);
  let y = Math.max(0, -miny);
  while (true) {
    if (collides(grid, shape, sx, y + 1)) break;
    y += 1;
    if (y > gridH) break;
  }
  if (collides(grid, shape, sx, y)) return null;
  return y;
}
function placeShapeOnGrid(grid, shape, sx, sy) {
  const newGrid = grid.map(row => row.slice());
  for (const [dx, dy] of shape) {
    const x = sx + dx, y = sy + dy;
    if (!inBounds(x, y)) return null;
    newGrid[y][x] = 1;
  }
  return newGrid;
}
function computeColumnHeights(grid) {
  const heights = new Array(gridW).fill(0);
  for (let x = 0; x < gridW; x++) {
    let h = 0;
    for (let y = 0; y < gridH; y++) {
      if (grid[y][x]) { h = gridH - y; break; }
    }
    heights[x] = h;
  }
  return heights;
}
function computeMaxHeight(heights) {
  let m = 0;
  for (let i = 0; i < heights.length; i++) if (heights[i] > m) m = heights[i];
  return m;
}
function countHoles(grid) {
  let holes = 0;
  for (let x = 0; x < gridW; x++) {
    let filledSeen = false;
    for (let y = 0; y < gridH; y++) {
      if (grid[y][x]) filledSeen = true; else if (filledSeen) holes++;
    }
  }
  return holes;
}
function computeBumpiness(heights) {
  let b = 0;
  for (let i = 0; i < gridW - 1; i++) b += Math.abs(heights[i] - heights[i+1]);
  return b;
}
function countCompleteLines(grid) {
  let c = 0;
  outer: for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) if (grid[y][x] !== 1) continue outer;
    c++;
  }
  return c;
}
function computeTopFilled(grid, topRows) {
  const rows = Math.max(0, Math.min(gridH, topRows));
  let s = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < gridW; x++) if (grid[y][x]) s++;
  }
  return s;
}

// Score a placement using both the previous grid and the result grid
function evaluatePlacement(baseGrid, trialGrid) {
  const heights = computeColumnHeights(trialGrid);
  const aggregateHeight = heights.reduce((a,b)=>a+b,0);
  const holes = countHoles(trialGrid);
  const bumpiness = computeBumpiness(heights);
  const completeLinesAfter = countCompleteLines(trialGrid);
  const completeLinesBefore = countCompleteLines(baseGrid);
  const linesDelta = Math.max(0, completeLinesAfter - completeLinesBefore);
  const maxHeight = computeMaxHeight(heights);
  const topRows = Math.max(2, Math.floor(gridH * 0.25));
  const topHeavy = computeTopFilled(trialGrid, topRows);

  const score = (
    AI_WEIGHTS.aggregate_height * aggregateHeight +
    AI_WEIGHTS.holes * holes +
    AI_WEIGHTS.bumpiness * bumpiness +
    AI_WEIGHTS.complete_lines * completeLinesAfter +
    AI_WEIGHTS.max_height * maxHeight +
    AI_WEIGHTS.top_heavy * topHeavy +
    AI_WEIGHTS.lines_delta * linesDelta
  );
  return score;
}
function evaluateGridForAI(grid) {
  const heights = computeColumnHeights(grid);
  const aggregateHeight = heights.reduce((a,b)=>a+b,0);
  const holes = countHoles(grid);
  const bumpiness = computeBumpiness(heights);
  const completeLines = countCompleteLines(grid);
  return (
    AI_WEIGHTS.aggregate_height * aggregateHeight +
    AI_WEIGHTS.holes * holes +
    AI_WEIGHTS.bumpiness * bumpiness +
    AI_WEIGHTS.complete_lines * completeLines
  );
}
function columnsForShapeAtX(shape, sx) {
  const cols = new Set();
  for (const [dx] of shape) cols.add(sx + dx);
  return cols;
}
function rankedPlacementsForPiece(grid, key) {
  const candidates = [];
  for (const shape of SHAPES[key]) {
    const [sxMin, sxMax] = validXRangeForShape(shape);
    for (let sx = sxMin; sx <= sxMax; sx++) {
      const sy = dropYForShape(grid, shape, sx);
      if (sy == null) continue;
      const trial = placeShapeOnGrid(grid, shape, sx, sy);
      if (!trial) continue;
      let score = evaluatePlacement(grid, trial);
      // Small random jitter to break ties and reduce left-bias
      score += (Math.random() - 0.5) * 0.001;
      const cols = columnsForShapeAtX(shape, sx);
      candidates.push({ score, shape, sx, sy, cols });
    }
  }
  candidates.sort((a,b)=>b.score - a.score);
  return candidates;
}

// Queue helpers
function generateBag() {
  const bag = SHAPE_KEYS.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
function refillQueue(q, minLen) {
  while (q.length < minLen) {
    for (const p of generateBag()) q.push(p);
  }
}

// Particles
function spawnRowParticles(particles, removedCells) {
  for (const [gx, gy] of removedCells) {
    const cx = padX + gx * (CELL + MARGIN) + CELL / 2;
    const cy = padY + gy * (CELL + MARGIN) + CELL / 2;
    for (let i = 0; i < ROW_PARTICLES_PER_BLOCK; i++) {
      const vx = (Math.random() * 0.4 - 0.2);
      const vy = (Math.random() * 0.2 - 0.35);
      const life = (500 + Math.random() * 400) | 0;
      const size = (3 + Math.random() * 3) | 0;
      particles.push({ px: cx, py: cy, vx, vy, life, maxLife: life, size, color: [150,150,170] });
    }
  }
}
function spawnAppleParticles(particles, pos) {
  if (!pos) return;
  const [gx, gy] = pos;
  const cx = padX + gx * (CELL + MARGIN) + CELL / 2;
  const cy = padY + gy * (CELL + MARGIN) + CELL / 2;
  for (let i = 0; i < APPLE_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.08 + Math.random() * 0.20;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed * -1.0;
    const life = (500 + Math.random() * 400) | 0;
    const size = (3 + Math.random() * 3) | 0;
    particles.push({ px: cx, py: cy, vx, vy, life, maxLife: life, size, color: [220,100,100] });
  }
}
function updateParticles(particles, dtMs) {
  let i = 0;
  for (const p of particles) {
    p.life -= dtMs;
    if (p.life <= 0) continue;
    p.vy += PARTICLE_GRAVITY * dtMs;
    p.px += p.vx * dtMs;
    p.py += p.vy * dtMs;
    particles[i++] = p;
  }
  particles.length = i;
}

// Snake
class Snake {
  constructor() {
    this.alive = false;
    this.body = []; // head at index 0
    this.len = SNAKE_MAX_LEN;
    this.apple = null;
    this.score = 0;
    this.lastRemovedCells = [];
    this.lastAppleEatenPos = null;
  }
  neighborsFilled(grid, x, y) {
    const out = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && grid[ny][nx] === 1) out.push([nx, ny]);
    }
    return out;
  }
  resetOnGrid(grid) {
    const filledCells = [];
    for (let y = 0; y < gridH; y++) for (let x = 0; x < gridW; x++) if (grid[y][x] === 1) filledCells.push([x,y]);
    if (filledCells.length < this.len) { this.alive = false; this.body = []; return false; }

    const findPathOfLength = (start, targetLen) => {
      const path = [start];
      const visited = new Set([start.toString()]);
      const dfs = (cur) => {
        if (path.length === targetLen) return true;
        const nbrs = this.neighborsFilled(grid, cur[0], cur[1]);
        for (let i = nbrs.length - 1; i > 0; i--) { const j = (Math.random() * (i+1))|0; [nbrs[i], nbrs[j]] = [nbrs[j], nbrs[i]]; }
        for (const nxt of nbrs) {
          const key = nxt.toString();
          if (visited.has(key)) continue;
          visited.add(key);
          path.push(nxt);
          if (dfs(nxt)) return true;
          path.pop();
          visited.delete(key);
        }
        return false;
      };
      return dfs(start) ? path.slice() : null;
    };

    const candidates = filledCells.slice();
    for (let i = candidates.length - 1; i > 0; i--) { const j = (Math.random()*(i+1))|0; [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
    const maxTries = Math.min(200, candidates.length);
    let found = null;
    for (let i = 0; i < maxTries; i++) {
      const head = candidates[i];
      const path = findPathOfLength(head, this.len);
      if (path) { found = path; break; }
    }
    if (!found) { this.alive = false; this.body = []; return false; }

    this.body = found;
    this.alive = true;
    this.placeApple(grid);
    return true;
  }
  placeApple(grid) {
    const snakeSet = new Set(this.body.map(p=>p.toString()));
    const candidates = [];
    for (let y = 0; y < gridH; y++) for (let x = 0; x < gridW; x++) if (grid[y][x]===1 && !snakeSet.has([x,y].toString())) candidates.push([x,y]);
    if (!candidates.length) { this.apple = null; return false; }
    const pick = candidates[(Math.random()*candidates.length)|0];
    this.apple = pick; return true;
  }
  shortestPath(grid, start, goal, snakeSet) {
    if (start[0]===goal[0] && start[1]===goal[1]) return [start];
    const tail = this.body.length ? this.body[this.body.length-1] : null;
    const key = (p)=>p[0]+','+p[1];
    const visited = new Set([key(start)]);
    const q = [[start,null]];
    const parent = new Map();
    const isBlocked = (pt) => {
      const k = key(pt);
      if (!snakeSet.has(k)) return false;
      return !(tail && tail[0]===pt[0] && tail[1]===pt[1]);
    };
    while (q.length) {
      const [cur, p] = q.shift();
      if (p) parent.set(key(cur), p);
      if (cur[0]===goal[0] && cur[1]===goal[1]) break;
      for (const nxt of this.neighborsFilled(grid, cur[0], cur[1])) {
        const nk = key(nxt);
        if (visited.has(nk)) continue;
        if (isBlocked(nxt)) continue;
        visited.add(nk);
        q.push([nxt, cur]);
      }
    }
    if (!parent.has(key(goal)) && !(start[0]===goal[0] && start[1]===goal[1])) return null;
    const path = [goal.slice()];
    let cur = goal.slice();
    while (!(cur[0]===start[0] && cur[1]===start[1])) {
      const p = parent.get(key(cur));
      if (!p) return null;
      cur = p;
      path.push(cur);
    }
    path.reverse();
    return path;
  }
  randomSafeMove(grid) {
    const head = this.body[0];
    const candidates = [];
    const snakeSet = new Set(this.body.map(p=>p.toString()));
    const tail = this.body[this.body.length-1];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = head[0]+dx, ny = head[1]+dy;
      if (!inBounds(nx, ny)) continue;
      if (grid[ny][nx] !== 1) continue;
      const sKey = nx+','+ny;
      if (snakeSet.has(sKey) && !(tail[0]===nx && tail[1]===ny)) continue;
      candidates.push([nx, ny]);
    }
    if (!candidates.length) return false;
    const nxt = candidates[(Math.random()*candidates.length)|0];
    this.body.unshift(nxt);
    this.body.pop();
    return true;
  }
  step(grid) {
    if (!this.alive) return 'dead';
    if (!this.apple) { if (!this.placeApple(grid)) return 'dead'; }
    const head = this.body[0];
    const snakeSet = new Set(this.body.map(p=>p.toString()));
    const path = this.shortestPath(grid, head, this.apple, snakeSet);
    if (!path || path.length < 2) {
      const moved = this.randomSafeMove(grid);
      if (!moved) { this.alive = false; return 'dead'; }
    } else {
      const nextPos = path[1];
      this.body.unshift(nextPos);
      this.body.pop();
    }
    if (this.body[0][0]===this.apple[0] && this.body[0][1]===this.apple[1]) {
      this.score += 1;
      const eatenPos = this.apple.slice();
      const [removed, removedY, removedCells] = removeOneBuildingRow(grid);
      this.lastRemovedCells = removed ? removedCells : [];
      this.lastAppleEatenPos = eatenPos;
      this.placeApple(grid);
      return removed ? 'apple' : 'apple_no_shrink';
    }
    return 'moved';
  }
}

function removeOneBuildingRow(grid) {
  const y = lowestNonEmptyRow(grid);
  if (y == null) return [false, null, []];
  const removedCells = [];
  for (let x = 0; x < gridW; x++) if (grid[y][x] === 1) removedCells.push([x,y]);
  for (let yy = y; yy >= 1; yy--) grid[yy] = grid[yy-1].slice();
  grid[0] = new Array(gridW).fill(0);
  return [true, y, removedCells];
}

// Rendering
function drawGrid(ctx, grid, snake, fallingPieces, particles) {
  // Background fill: clear fully to avoid alpha accumulation/ghosting
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const ox = padX;
  const oy = padY;

  // Board cells
  ctx.save();
  ctx.globalAlpha = ALPHA_BLOCK;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const rx = ox + x * (CELL + MARGIN);
      const ry = oy + y * (CELL + MARGIN);
      ctx.fillStyle = grid[y][x] ? BLOCK_COLOR : EMPTY_COLOR;
      roundRect(ctx, rx, ry, CELL, CELL, 6);
    }
  }
  ctx.restore();

  // Falling pieces overlay
  if (fallingPieces.length) {
    for (const fp of fallingPieces) {
      const { shape, sx } = fp;
      const syCur = fp.sy;
      const syTarget = fp.targetSy != null ? fp.targetSy : syCur;
      const totalDrop = Math.max(1, fp.totalDrop != null ? fp.totalDrop : (syTarget - syCur));
      const distRemaining = Math.max(0, syTarget - syCur);
      const proximity = 1 - Math.min(1, distRemaining / totalDrop); // 0 far -> 1 near
      const pieceAlpha = (FALLING_ALPHA_FAR + (FALLING_ALPHA_NEAR - FALLING_ALPHA_FAR) * proximity);
      for (const [dx, dy] of shape) {
        const x = sx + dx, y = syCur + dy;
        if (!inBounds(x, y)) continue;
        const rx = ox + x * (CELL + MARGIN);
        const ry = oy + y * (CELL + MARGIN);
        ctx.save();
        ctx.globalAlpha = pieceAlpha;
        ctx.fillStyle = FALLING_PIECE_COLOR;
        roundRect(ctx, rx, ry, CELL, CELL, 6);
        ctx.restore();
      }
    }
  }

  // Apple
  if (snake.alive && snake.apple) {
    const [ax, ay] = snake.apple;
    const rx = ox + ax * (CELL + MARGIN);
    const ry = oy + ay * (CELL + MARGIN);
    ctx.save();
    ctx.globalAlpha = ALPHA_APPLE;
    ctx.fillStyle = APPLE_COLOR;
    roundRect(ctx, rx, ry, CELL, CELL, 6);
    ctx.restore();
  }

  // Snake with tapered segments
  if (snake.alive && snake.body.length) {
    const n = Math.max(1, snake.body.length);
    for (let i = 0; i < snake.body.length; i++) {
      const [x, y] = snake.body[i];
      const scale = n === 1 ? 1.0 : (1.0 - (i / (n - 1)) * 0.3);
      const size = (CELL * scale);
      const inset = ((CELL - size) / 2);
      const rx = ox + x * (CELL + MARGIN) + inset;
      const ry = oy + y * (CELL + MARGIN) + inset;
      ctx.save();
      ctx.globalAlpha = ALPHA_SNAKE;
      ctx.fillStyle = i === 0 ? SNAKE_COLOR : SNAKE_TAIL;
      roundRect(ctx, rx, ry, size, size, 8);
      ctx.restore();
    }
  }

  // Particles
  if (particles.length) {
    ctx.save();
    ctx.globalAlpha = ALPHA_PARTICLE;
    for (const p of particles) {
      const lifeRatio = Math.max(0, Math.min(1, p.life / p.maxLife));
      const size = Math.max(1, (p.size * lifeRatio));
      ctx.fillStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`;
      ctx.beginPath();
      ctx.roundRect((p.px - size / 2) * DPR, (p.py - size / 2) * DPR, size * DPR, size * DPR, 2 * DPR);
      ctx.fill();
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x * DPR, y * DPR, w * DPR, h * DPR, r * DPR);
  ctx.fill();
}

// Simulation State
let grid = emptyGrid();
const snake = new Snake();
const pieceQueue = [];
refillQueue(pieceQueue, NEXT_PREVIEW + 5);
let falling_pieces = [];
let particles = [];

let fallTimer = 0;
let snakeTimer = 0;
let balanceTimer = 0;
let pieceGravityMs = PIECE_GRAVITY_MS_DEFAULT;
let piecesLockedCount = 0;
let applesEatenCount = 0;

// Spawn staggering
let spawnTimer = 0;
let nextSpawnDelayMs = 0;
let baseSpawnDelayMs = 220;

let sandReflowActive = false;
let sandStableFrames = 0;
let snakeFrozenDuringReflow = false;
let reflowSnakeNorm = null; // array of [nx, ny] in [0..1]
let reflowAppleNorm = null; // [nx, ny]

function mapNormToGrid(norm, w, h) {
  const x = Math.min(w - 1, Math.max(0, Math.round((norm[0] || 0) * (w - 1))));
  const y = Math.min(h - 1, Math.max(0, Math.round((norm[1] || 0) * (h - 1))));
  return [x, y];
}

function startSandReflow(newCols, newRows) {
  // Capture normalized snake and apple positions
  const oldW = gridW;
  const oldH = gridH;
  if (snake && snake.body && snake.body.length) {
    const denomX = Math.max(1, oldW - 1);
    const denomY = Math.max(1, oldH - 1);
    reflowSnakeNorm = snake.body.map(([x, y]) => [x / denomX, y / denomY]);
  } else {
    reflowSnakeNorm = null;
  }
  if (snake && snake.apple) {
    const denomX = Math.max(1, oldW - 1);
    const denomY = Math.max(1, oldH - 1);
    reflowAppleNorm = [snake.apple[0] / denomX, snake.apple[1] / denomY];
  } else {
    reflowAppleNorm = null;
  }

  // Map old filled cells into new grid dimensions
  const filled = [];
  for (let y = 0; y < oldH; y++) {
    for (let x = 0; x < oldW; x++) {
      if (grid[y][x] === 1) filled.push([x, y]);
    }
  }
  gridW = newCols;
  gridH = newRows;
  grid = emptyGrid();
  // Place mapped blocks
  const denomX = Math.max(1, oldW - 1);
  const denomY = Math.max(1, oldH - 1);
  for (const [ox, oy] of filled) {
    const nx = Math.min(gridW - 1, Math.max(0, Math.round((ox / denomX) * (gridW - 1))));
    const ny = Math.min(gridH - 1, Math.max(0, Math.round((oy / denomY) * (gridH - 1))));
    grid[ny][nx] = 1;
  }
  // Clear active falling pieces to avoid conflicts
  falling_pieces = [];

  // Freeze snake and apple mapped to new grid without stepping
  if (reflowSnakeNorm) {
    snake.body = reflowSnakeNorm.map(n => mapNormToGrid(n, gridW, gridH));
    snake.alive = true;
  } else {
    snake.alive = false;
    snake.body = [];
  }
  if (reflowAppleNorm) {
    snake.apple = mapNormToGrid(reflowAppleNorm, gridW, gridH);
  } else {
    snake.apple = null;
  }

  snakeFrozenDuringReflow = true;
  sandReflowActive = true;
  sandStableFrames = 0;
}

function snapSnakeAndAppleToSand() {
  if (!snake || !snake.body || snake.body.length === 0) return;
  // Drop the head to nearest fill in same column
  const head = snake.body[0].slice();
  let yDrop = head[1];
  while (yDrop + 1 < gridH && grid[yDrop + 1][head[0]] === 0) yDrop++;
  const delta = yDrop - head[1];
  if (delta !== 0) {
    snake.body = snake.body.map(([x, y]) => {
      let ny = Math.min(gridH - 1, Math.max(0, y + delta));
      return [x, ny];
    });
  }
  // Ensure segments lie on filled cells by dropping any that are floating
  snake.body = snake.body.map(([x, y]) => {
    let ny = y;
    while (ny + 1 < gridH && grid[ny][x] === 0) ny++;
    return [x, ny];
  });
  // Snap apple similarly if present
  if (snake.apple) {
    let [ax, ay] = snake.apple;
    while (ay + 1 < gridH && grid[ay + 1][ax] === 0) ay++;
    if (grid[ay][ax] === 0) {
      // if column empty, search downward to bottom-most filled cell in column
      for (let yy = gridH - 1; yy >= 0; yy--) {
        if (grid[yy][ax] === 1) { ay = yy; break; }
      }
    }
    snake.apple = [ax, ay];
  }
}

function settleSandStep() {
  let moved = false;
  // Iterate bottom-up
  for (let y = gridH - 2; y >= 0; y--) {
    // Randomize horizontal scan direction per row to reduce bias
    const leftToRight = ((y * 9301 + 49297) % 233280) % 2 === 0;
    if (leftToRight) {
      for (let x = 0; x < gridW; x++) {
        if (grid[y][x] !== 1) continue;
        if (grid[y + 1][x] === 0) {
          grid[y + 1][x] = 1; grid[y][x] = 0; moved = true; continue;
        }
        const dirFirst = ((x * 1103515245 + 12345) >>> 0) % 2 === 0 ? -1 : 1;
        const dirs = [dirFirst, -dirFirst];
        for (const dx of dirs) {
          const nx = x + dx;
          if (nx < 0 || nx >= gridW) continue;
          if (grid[y][nx] === 0 && grid[y + 1][nx] === 0) {
            grid[y + 1][nx] = 1; grid[y][x] = 0; moved = true; break;
          }
        }
      }
    } else {
      for (let x = gridW - 1; x >= 0; x--) {
        if (grid[y][x] !== 1) continue;
        if (grid[y + 1][x] === 0) {
          grid[y + 1][x] = 1; grid[y][x] = 0; moved = true; continue;
        }
        const dirFirst = ((x * 1664525 + 1013904223) >>> 0) % 2 === 0 ? -1 : 1;
        const dirs = [dirFirst, -dirFirst];
        for (const dx of dirs) {
          const nx = x + dx;
          if (nx < 0 || nx >= gridW) continue;
          if (grid[y][nx] === 0 && grid[y + 1][nx] === 0) {
            grid[y + 1][nx] = 1; grid[y][x] = 0; moved = true; break;
          }
        }
      }
    }
  }
  return moved;
}

function resetWorld(newCols, newRows) {
  gridW = newCols;
  gridH = newRows;
  grid = emptyGrid();
  falling_pieces = [];
  particles = [];
  snake.alive = false;
  snake.body = [];
  snake.apple = null;
  fallTimer = 0;
  snakeTimer = 0;
  balanceTimer = 0;
  // pieceGravityMs and concurrency will be set by resize
  piecesLockedCount = 0;
  applesEatenCount = 0;
  // Reset spawn staggering
  spawnTimer = 0;
  nextSpawnDelayMs = 0;
  // Refill queue
  while (pieceQueue.length) pieceQueue.pop();
  refillQueue(pieceQueue, NEXT_PREVIEW + 5);
}

function computeWorldParams() {
  // Baselines taken from configuration
  const BASE_W = BASE_W_BASELINE;
  const BASE_H = BASE_H_BASELINE;
  const BASE_FALL_MS = 90; // baseline fall speed at BASE_H
  const BASE_CONCURRENCY = 3; // baseline concurrent pieces at BASE_W

  // Falling speed: larger height reduces ms per step by HEIGHT_TO_FALL_MS_RATE per extra row
  const fallMs = Math.round(BASE_FALL_MS - HEIGHT_TO_FALL_MS_RATE * (gridH - BASE_H));
  const basePieceGravity = Math.max(GRAVITY_MIN_MS, Math.min(200, fallMs));

  // Concurrency: larger width increases number of pieces by WIDTH_TO_CONCURRENCY_RATE per extra col
  const conc = Math.round(BASE_CONCURRENCY + WIDTH_TO_CONCURRENCY_RATE * (gridW - BASE_W));
  const concurrent = Math.max(1, Math.min(10, conc));

  // Spawn delay: larger worlds spawn more frequently
  const BASE_AREA = 30 * 22;
  const areaRatio = Math.max(0.5, Math.min(3.0, (gridW * gridH) / BASE_AREA));
  const tArea = (areaRatio - 0.5) / (3.0 - 0.5); // 0..1
  const baseSpawnDelay = Math.round(320 + (100 - 320) * tArea); // small->slower, large->faster

  return { basePieceGravity, concurrent, baseSpawnDelayMs: baseSpawnDelay };
}

function randomSpawnDelay(base) {
  // Randomize around base: 70%..150%
  return Math.max(40, Math.round(base * (0.7 + Math.random() * 0.8)));
}

// Resize handling: choose cols/rows to maximize coverage with min cell size, then center
function resizeCanvas() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;

  // Update canvas backing store size
  canvas.width = Math.floor(cssW * DPR);
  canvas.height = Math.floor(cssH * DPR);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';

  // Dynamic minimum cell size based on viewport area
  const areaRatio = (cssW * cssH) / (BASE_VIEWPORT_W * BASE_VIEWPORT_H);
  const lengthRatio = Math.max(0.4, Math.sqrt(Math.max(0.01, areaRatio)));
  const minCell = Math.max(
    8,
    Math.min(
      MAX_CELL_PX,
      Math.round(BASE_MIN_CELL_PX * (1 + CELL_SIZE_SCALE_RATE * (lengthRatio - 1)))
    )
  );

  const innerW = cssW;
  const innerH = cssH;

  const colsMax = Math.max(10, Math.floor((innerW + MARGIN) / (minCell + MARGIN)));
  const rowsMax = Math.max(8, Math.floor((innerH + MARGIN) / (minCell + MARGIN)));

  // Try to match aspect ratio by probing around colsMax/rowsMax
  let best = null;
  for (let cols = Math.max(10, colsMax - 4); cols <= colsMax; cols++) {
    for (let rows = Math.max(8, rowsMax - 4); rows <= rowsMax; rows++) {
      const cellW = (innerW + MARGIN) / cols - MARGIN;
      const cellH = (innerH + MARGIN) / rows - MARGIN;
      const cell = Math.min(cellW, cellH);
      if (cell < minCell) continue;
      const gridPxW = cols * (cell + MARGIN) - MARGIN;
      const gridPxH = rows * (cell + MARGIN) - MARGIN;
      const waste = (innerW - gridPxW) + (innerH - gridPxH);
      if (!best || waste < best.waste) best = { cols, rows, cell, gridPxW, gridPxH };
    }
  }
  if (!best) {
    // Fallback: use max counts
    const cols = colsMax, rows = rowsMax;
    const cellW = (innerW + MARGIN) / cols - MARGIN;
    const cellH = (innerH + MARGIN) / rows - MARGIN;
    best = { cols, rows, cell: Math.max(6, Math.min(cellW, cellH)), gridPxW: 0, gridPxH: 0 };
    best.gridPxW = cols * (best.cell + MARGIN) - MARGIN;
    best.gridPxH = rows * (best.cell + MARGIN) - MARGIN;
  }

  const dimsChanged = (gridW !== best.cols || gridH !== best.rows);
  CELL = best.cell;
  padX = (innerW - best.gridPxW) / 2;
  padY = (innerH - best.gridPxH) / 2;

  if (dimsChanged) {
    startSandReflow(best.cols, best.rows);
  }
  // Recompute speeds and concurrency on every resize
  const { basePieceGravity, concurrent, baseSpawnDelayMs: spawnBase } = computeWorldParams();
  pieceGravityMs = Math.max(GRAVITY_MIN_MS, basePieceGravity);
  maxConcurrentPieces = concurrent;
  baseSpawnDelayMs = spawnBase;
  if (nextSpawnDelayMs === 0) nextSpawnDelayMs = randomSpawnDelay(baseSpawnDelayMs);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Spawn logic
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function trySpawnPieces() {
  // Spawn at most one piece per delay window
  if (falling_pieces.length >= maxConcurrentPieces) return;
  if (spawnTimer < nextSpawnDelayMs) return;

  if (pieceQueue.length < NEXT_PREVIEW + 1) refillQueue(pieceQueue, NEXT_PREVIEW + 5);

  // Avoid column overlap with existing falling pieces
  const reservedCols = new Set();
  for (const fp of falling_pieces) for (const c of fp.cols) reservedCols.add(c);

  if (!pieceQueue.length) return;
  const pieceKey = pieceQueue[0];
  const ranked = rankedPlacementsForPiece(grid, pieceKey);
  if (!ranked.length) {
    // Rotate queue and retry soon
    pieceQueue.push(pieceQueue.shift());
    nextSpawnDelayMs = randomSpawnDelay(Math.max(80, baseSpawnDelayMs * 0.6));
    spawnTimer = 0;
    return;
  }

  // Randomize among top candidates
  const k = Math.min(8, ranked.length);
  const top = shuffle(ranked.slice(0, k));
  const rest = shuffle(ranked.slice(k));
  const ordered = top.concat(rest);

  for (const cand of ordered) {
    const { shape, sx, sy, cols } = cand;
    let overlap = false;
    for (const c of cols) if (reservedCols.has(c)) { overlap = true; break; }
    if (overlap) continue;
    const [, , miny] = shapeBounds(shape);
    let sySpawn = Math.max(0, -miny);
    while (sySpawn < sy && collides(grid, shape, sx, sySpawn)) sySpawn++;
    const totalDrop = Math.max(1, sy - sySpawn);
    falling_pieces.push({ key: pieceKey, shape, sx, sy: sySpawn, cols, targetSy: sy, totalDrop });
    for (const c of cols) reservedCols.add(c);
    pieceQueue.shift();

    // Schedule next spawn
    nextSpawnDelayMs = randomSpawnDelay(baseSpawnDelayMs);
    spawnTimer = 0;
    return;
  }

  // If none fit due to overlaps, rotate and retry soon
  pieceQueue.push(pieceQueue.shift());
  nextSpawnDelayMs = randomSpawnDelay(Math.max(80, baseSpawnDelayMs * 0.6));
  spawnTimer = 0;
}

// Remove interaction dampening handlers (no-ops now)
// Previously: setFocusDampen, scroll and mousemove listeners

// Game loop
let lastTs = performance.now();
let pause = false;

document.addEventListener('visibilitychange', () => {
  pause = document.hidden;
});

function step(now) {
  const dt = Math.min(100, now - lastTs);
  lastTs = now;
  if (pause) { requestAnimationFrame(step); return; }

  // Fixed speeds (no dampening)
  fallTimer += dt;
  snakeTimer += dt;
  balanceTimer += dt;
  spawnTimer += dt;

  if (sandReflowActive) {
    let movedAny = false;
    for (let i = 0; i < 6; i++) {
      if (settleSandStep()) movedAny = true; else break;
    }
    if (!movedAny) {
      sandStableFrames += 1;
      if (sandStableFrames >= 8) {
        sandReflowActive = false;
        snakeFrozenDuringReflow = false;
        snapSnakeAndAppleToSand();
      }
    } else {
      sandStableFrames = 0;
    }
  } else {
    // Falling pieces motion
    if (falling_pieces.length && fallTimer >= pieceGravityMs) {
      const steps = Math.min(4, Math.floor(fallTimer / pieceGravityMs));
      fallTimer = fallTimer % pieceGravityMs;
      for (let s = 0; s < steps; s++) {
        const newList = [];
        for (const fp of falling_pieces) {
          const { sx, sy, shape } = fp;
          if (collides(grid, shape, sx, sy + 1)) {
            for (const [dx, dy] of shape) {
              const x = sx + dx, y = sy + dy;
              if (inBounds(x, y)) grid[y][x] = 1;
            }
            piecesLockedCount++;
          } else {
            fp.sy = sy + 1;
            newList.push(fp);
          }
        }
        falling_pieces = newList;
      }
    }

    trySpawnPieces();

    // Snake spawn or step
    if (!snake.alive && countNonEmptyRows(grid) >= SNAKE_MIN_BUILD_ROWS) {
      snake.resetOnGrid(grid);
    }

    const rows = countNonEmptyRows(grid);
    const t = Math.max(0, Math.min(1, rows / gridH));
    const tEff = Math.max(0, Math.min(1, t * SNAKE_SPEED_RATE));
    const snakeStepMs = (SNAKE_STEP_MS_SLOW + (SNAKE_STEP_MS_FAST - SNAKE_STEP_MS_SLOW) * tEff) | 0;

    if (!snakeFrozenDuringReflow && snakeTimer >= snakeStepMs && snake.alive) {
      snakeTimer = 0;
      const res = snake.step(grid);
      if (res === 'dead') {
        snake.resetOnGrid(grid);
      } else if (res === 'apple') {
        applesEatenCount++;
        for (const fp of falling_pieces) {
          fp.sy = Math.min(gridH - 1, fp.sy + 1);
          if (fp.targetSy != null) fp.targetSy = Math.min(gridH - 1, fp.targetSy + 1);
        }
        spawnRowParticles(particles, snake.lastRemovedCells);
        spawnAppleParticles(particles, snake.lastAppleEatenPos);
      } else if (res === 'apple_no_shrink') {
        applesEatenCount++;
        spawnAppleParticles(particles, snake.lastAppleEatenPos);
      }
    }

    if (AUTO_BALANCE && balanceTimer >= BALANCE_INTERVAL_MS) {
      balanceTimer = 0;
      if (applesEatenCount > piecesLockedCount) {
        if (pieceGravityMs > GRAVITY_MIN_MS) {
          pieceGravityMs = Math.max(GRAVITY_MIN_MS, (pieceGravityMs * 0.85) | 0);
        }
      }
      piecesLockedCount = 0;
      applesEatenCount = 0;
    }
  }

  // Particles
  updateParticles(particles, dt);

  // Draw
  drawGrid(ctx, grid, snake, falling_pieces, particles);

  requestAnimationFrame(step);
}
requestAnimationFrame(step); 