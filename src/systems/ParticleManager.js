export const ParticleManager = {
  particles: [],
  
  init() {
    this.createParticleContainer();
    this.startAnimationLoop();
  },
  
  createParticleContainer() {
    if (document.getElementById('particle-container')) return;
    
    const container = document.createElement('div');
    container.id = 'particle-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
      overflow: hidden;
    `;
    document.body.appendChild(container);
  },
  
  createParticle(x, y, options = {}) {
    const particle = document.createElement('div');
    const id = Date.now() + Math.random();
    
    const config = {
      type: 'star',
      color: '#FFD700',
      size: 8,
      duration: 1000,
      velocity: { x: 0, y: -50 },
      gravity: 0.5,
      fade: true,
      ...options
    };
    
    particle.className = 'particle';
    particle.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${config.size}px;
      height: ${config.size}px;
      background: ${config.color};
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      box-shadow: 0 0 6px ${config.color};
    `;
    
    if (config.type === 'star') {
      particle.innerHTML = '✨';
      particle.style.background = 'none';
      particle.style.fontSize = `${config.size}px`;
      particle.style.display = 'flex';
      particle.style.alignItems = 'center';
      particle.style.justifyContent = 'center';
    } else if (config.type === 'coin') {
      particle.innerHTML = '💰';
      particle.style.background = 'none';
      particle.style.fontSize = `${config.size}px`;
      particle.style.display = 'flex';
      particle.style.alignItems = 'center';
      particle.style.justifyContent = 'center';
    }
    
    const container = document.getElementById('particle-container');
    if (container) {
      container.appendChild(particle);
    }
    
    // Store particle data
    this.particles.push({
      id,
      element: particle,
      x, y,
      vx: config.velocity.x + (Math.random() - 0.5) * 20,
      vy: config.velocity.y + (Math.random() - 0.5) * 10,
      gravity: config.gravity,
      startTime: Date.now(),
      duration: config.duration,
      fade: config.fade,
      size: config.size
    });
    
    return id;
  },
  
  levelUpBurst(x, y) {
    for (let i = 0; i < 8; i++) {
      this.createParticle(x + Math.random() * 40 - 20, y + Math.random() * 40 - 20, {
        type: 'star',
        color: '#FFD700',
        size: 12 + Math.random() * 8,
        duration: 1500,
        velocity: {
          x: (Math.random() - 0.5) * 100,
          y: -50 - Math.random() * 50
        },
        gravity: 0.3
      });
    }
  },
  
  fishCatchSplash(x, y) {
    for (let i = 0; i < 6; i++) {
      this.createParticle(x + Math.random() * 30 - 15, y + Math.random() * 30 - 15, {
        type: 'star',
        color: '#60a5fa',
        size: 6 + Math.random() * 4,
        duration: 800,
        velocity: {
          x: (Math.random() - 0.5) * 80,
          y: -30 - Math.random() * 30
        },
        gravity: 0.4
      });
    }
  },
  
  goldPickupEffect(x, y) {
    for (let i = 0; i < 5; i++) {
      this.createParticle(x + Math.random() * 20 - 10, y + Math.random() * 20 - 10, {
        type: 'coin',
        size: 8 + Math.random() * 4,
        duration: 1200,
        velocity: {
          x: (Math.random() - 0.5) * 60,
          y: -40 - Math.random() * 20
        },
        gravity: 0.2
      });
    }
  },
  
  marketSellEffect(x, y) {
    for (let i = 0; i < 4; i++) {
      this.createParticle(x + Math.random() * 25 - 12, y + Math.random() * 25 - 12, {
        type: 'coin',
        size: 10 + Math.random() * 6,
        duration: 1000,
        velocity: {
          x: (Math.random() - 0.5) * 40,
          y: -30 - Math.random() * 20
        },
        gravity: 0.3
      });
    }
  },
  
  updateParticles() {
    const now = Date.now();
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      const elapsed = now - particle.startTime;
      
      if (elapsed > particle.duration) {
        // Remove expired particle
        if (particle.element.parentNode) {
          particle.element.parentNode.removeChild(particle.element);
        }
        this.particles.splice(i, 1);
        continue;
      }
      
      // Update position
      particle.vy += particle.gravity;
      particle.x += particle.vx * 0.016;
      particle.y += particle.vy * 0.016;
      
      // Apply drag
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      
      // Update DOM element
      particle.element.style.left = `${particle.x}px`;
      particle.element.style.top = `${particle.y}px`;
      
      // Fade out
      if (particle.fade) {
        const progress = elapsed / particle.duration;
        const opacity = 1 - progress;
        particle.element.style.opacity = opacity;
      }
    }
  },
  
  startAnimationLoop() {
    const animate = () => {
      this.updateParticles();
      requestAnimationFrame(animate);
    };
    animate();
  }
};
