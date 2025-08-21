import { game } from './core.js';

// Gold drop visual effects module
// Exports: createGoldDrop(x,y,amount), updateGoldDrops(dt), drawGoldDrops()

const goldDrops = [];

export function createGoldDrop(x, y, amount) {
  goldDrops.push({
    x: x,
    y: y,
    amount: amount,
    life: 3.0, // 3 seconds duration
    maxLife: 3.0,
    startY: y,
    floatDistance: 30
  });
}

export function updateGoldDrops(dt) {
  for (let i = goldDrops.length - 1; i >= 0; i--) {
    const drop = goldDrops[i];
    drop.life -= dt;
    const progress = 1 - (drop.life / drop.maxLife);
    const easeProgress = 1 - Math.pow(1 - progress, 2); // ease-out quadratic
    drop.y = drop.startY - (drop.floatDistance * easeProgress);
    if (drop.life <= 0) goldDrops.splice(i, 1);
  }
}

export function drawGoldDrops() {
  const { ctx } = game;
  if (!ctx) return;

  for (const drop of goldDrops) {
    const alpha = drop.life / drop.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;

    const tokenX = drop.x - 4;
    const tokenY = drop.y - 3;
    const tokenSize = 3;

    // Outer hexagonal frame
    ctx.beginPath();
    const sides = 6;
    const angle = Math.PI / 3;
    ctx.moveTo(tokenX + tokenSize * Math.cos(0), tokenY + tokenSize * Math.sin(0));
    for (let i = 1; i <= sides; i++) {
      const px = tokenX + tokenSize * Math.cos(i * angle);
      const py = tokenY + tokenSize * Math.sin(i * angle);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#00FFFF';
    ctx.fill();
    ctx.strokeStyle = '#0080FF';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Inner energy core
    ctx.beginPath();
    ctx.arc(tokenX, tokenY, tokenSize * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Amount text
    ctx.font = '8px monospace';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeText(`+${drop.amount}`, drop.x + 2, drop.y);
    ctx.fillText(`+${drop.amount}`, drop.x + 2, drop.y);

    ctx.restore();
  }
}


