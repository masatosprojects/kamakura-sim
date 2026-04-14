/* Canvas Animation Logic for Klupfel, Tobler, and Herd */

function drawAgents(ctx, agents, width, height) {
    ctx.clearRect(0,0, width, height);
    agents.forEach(a => {
        ctx.beginPath();
        let x = a.x; let y = a.y;
        ctx.arc(x, y, a.r || 4, 0, Math.PI*2);
        ctx.fillStyle = a.color || '#fff';
        
        // Draw Herd Outline
        if(a.herd) {
            ctx.strokeStyle = '#e1b12c';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.fill();
    });
}

window.startKlupfel = function() {
    const canvas = document.getElementById('canvas-klupfel');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.parentElement.offsetWidth;
    const H = canvas.height = 250;
    
    let agents = [];
    for(let i=0; i<80; i++) {
        agents.push({
            x: Math.random() * W,
            y: H/2 + (Math.random()*40-20),
            speed: 1 + Math.random(),
            color: '#0097e6'
        });
    }

    // Bottleneck logic
    function loop() {
        if(!canvas.offsetParent) return requestAnimationFrame(loop); // Pause if hidden
        
        // Calculate density near bottleneck (center)
        let inBottleneck = agents.filter(a => a.x > W/2 - 50 && a.x < W/2 + 50).length;
        let density = inBottleneck / 80;
        
        agents.forEach(a => {
            let speedMult = 1.0;
            // Apply Klupfel speed drop at high density bottleneck
            if(a.x > W/2 - 100 && a.x < W/2 + 50) {
                speedMult = Math.max(0.1, 1 - density * 2.5); // Jam
                if (speedMult < 0.3) {
                    a.color = '#e84118'; // Turn red when jammed
                } else {
                    a.color = '#e1b12c'; // Yellow slowing
                }
            } else {
                a.color = '#0097e6';
            }
            a.x += a.speed * speedMult;
            if(a.x > W) a.x = -10;
        });
        
        drawAgents(ctx, agents, W, H);
        requestAnimationFrame(loop);
    }
    loop();
};

window.startTobler = function() {
    const canvas = document.getElementById('canvas-tobler');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.parentElement.offsetWidth;
    const H = canvas.height = 250;

    let agents = [{x: 0, y: H/2, speed: 2}];

    function drawTerrain() {
        ctx.beginPath();
        ctx.moveTo(0, H/2);
        // Uphill
        ctx.lineTo(W/3, H/2 - 80);
        // Downhill gentle
        ctx.lineTo(W, H/2 + 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.stroke();
    }

    function loop() {
        if(!canvas.offsetParent) return requestAnimationFrame(loop);
        
        ctx.clearRect(0,0, W, H);
        drawTerrain();
        
        agents.forEach(a => {
            let S = 0; // Slope
            let targetY = H/2;
            if(a.x < W/3) {
                // Uphill
                S = 0.5; // steep up
                targetY = H/2 - 80 * (a.x / (W/3));
            } else {
                // Downhill
                S = -0.1; // gentle down
                let pct = (a.x - W/3) / (W * 2/3);
                targetY = (H/2 - 80) + (110 * pct);
            }
            // Tobler formula approx
            let speedMult = Math.exp(-3.5 * Math.abs(S + 0.05) + 0.175);
            a.x += speedMult * 2;
            a.y = targetY;
            if(a.x > W) a.x = 0;
            
            // Draw speed indicator
            ctx.fillStyle = '#4cd137';
            ctx.beginPath();
            ctx.arc(a.x, a.y, 6, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.fillText(speedMult.toFixed(2) + "x spd", a.x - 15, a.y - 15);
        });
        requestAnimationFrame(loop);
    }
    loop();
};

window.startHerd = function() {
    const canvas = document.getElementById('canvas-herd');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.parentElement.offsetWidth;
    const H = canvas.height = 250;

    let agents = [];
    for(let i=0; i<40; i++) {
        agents.push({
            x: Math.random() * W, y: Math.random() * H,
            dx: Math.random()*2-1, dy: Math.random()*2-1,
            panic: i===0 // Agent 0 is source
        });
    }

    function loop() {
        if(!canvas.offsetParent) return requestAnimationFrame(loop);
        
        agents.forEach((a, i) => {
            // Panic source erratic fast movement
            if(a.panic && i === 0) {
                a.x += a.dx * 3; a.y += a.dy * 3;
                if(Math.random() < 0.05) { a.dx = Math.random()*2-1; a.dy = Math.random()*2-1; }
                a.color = '#e84118';
                a.r = 6;
            } else {
                a.x += a.dx; a.y += a.dy;
                a.color = '#0097e6';
                a.r = 4;
            }
            
            // Bounce bounds
            if(a.x<0||a.x>W) a.dx*=-1;
            if(a.y<0||a.y>H) a.dy*=-1;
            
            // Contagion
            a.herd = false;
            if(!a.panic || i !== 0) {
                let panicDist = Math.hypot(a.x - agents[0].x, a.y - agents[0].y);
                if(panicDist < 100) {
                    a.herd = true;
                    // Follow panic source
                    a.dx += (agents[0].x - a.x)*0.01;
                    a.dy += (agents[0].y - a.y)*0.01;
                }
            }
        });
        
        drawAgents(ctx, agents, W, H);
        requestAnimationFrame(loop);
    }
    loop();
};
