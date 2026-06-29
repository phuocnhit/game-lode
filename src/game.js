(() => {
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true);

  const TILE = 2; // world units per tile
  const PLAYER_RADIUS = 0.4 * TILE;

  const MAP = [
    "####################",
    "#...........G......#",
    "#..H...............#",
    "#..H..####..###....#",
    "#..H...............#",
    "#..H.....G....###..#",
    "#..H....#####......#",
    "#..H...............#",
    "#..H...........E...#",
    "#P..................#",
    "####################"
  ];

  function createScene() {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.9, 1.0);

    const camera = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 10, -20), scene);
    camera.setTarget(new BABYLON.Vector3(10, 6, 0));
    camera.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
    camera.attachControl(canvas, true);

    const light = new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.95;

    const mapW = MAP[0].length;
    const mapH = MAP.length;

    const background = BABYLON.MeshBuilder.CreateBox('bg_cube', {
      width: mapW * TILE + TILE * 2,
      height: mapH * TILE + TILE * 2,
      depth: TILE * 0.5,
    }, scene);
    background.position = new BABYLON.Vector3(
      (mapW * TILE) / 2,
      (mapH * TILE) / 2,
      TILE * 6
    );
    background.material = new BABYLON.StandardMaterial('m_bg', scene);
    background.material.diffuseColor = new BABYLON.Color3(0.55, 0.75, 0.95);
    background.material.emissiveColor = new BABYLON.Color3(0.08, 0.12, 0.18);
    background.material.backFaceCulling = false;

    const tiles = [];
    const golds = [];
    const enemies = [];

    function tileToWorld(col, row) {
      const x = col * TILE + TILE / 2;
      const y = (mapH - 1 - row) * TILE + TILE / 2;
      return {x, y};
    }

    // Create simple ground plane (not used for collisions)
    const ground = BABYLON.MeshBuilder.CreateGround('g', {width: mapW * TILE, height: mapH * TILE}, scene);
    ground.position.x = (mapW * TILE) / 2;
    ground.position.y = (mapH * TILE) / 2;
    ground.receiveShadows = false;
    ground.isVisible = false;

    // Parse map and create meshes
    for (let r = 0; r < mapH; r++) {
      tiles[r] = [];
      for (let c = 0; c < mapW; c++) {
        const ch = MAP[r][c];
        tiles[r][c] = ch;
        const w = tileToWorld(c, r);
        if (ch === '#') {
          const box = BABYLON.MeshBuilder.CreateBox(`b_${r}_${c}`, {size: TILE}, scene);
          box.position = new BABYLON.Vector3(w.x, w.y, 0);
          box.material = new BABYLON.StandardMaterial('m_block', scene);
          box.material.diffuseColor = new BABYLON.Color3(0.35, 0.25, 0.1);
        } else if (ch === 'H') {
          const ladder = BABYLON.MeshBuilder.CreateBox(`lad_${r}_${c}`, {width: TILE * 0.4, depth: 0.2, height: TILE}, scene);
          ladder.position = new BABYLON.Vector3(w.x, w.y, 0);
          ladder.material = new BABYLON.StandardMaterial('m_ladder', scene);
          ladder.material.diffuseColor = new BABYLON.Color3(0.9, 0.7, 0.4);
        } else if (ch === 'G') {
          const gold = BABYLON.MeshBuilder.CreateSphere(`gold_${r}_${c}`, {diameter: TILE * 0.5}, scene);
          gold.position = new BABYLON.Vector3(w.x, w.y, 0);
          gold.material = new BABYLON.StandardMaterial('m_gold', scene);
          gold.material.diffuseColor = new BABYLON.Color3(1, 0.85, 0);
          golds.push({mesh: gold, r, c});
        } else if (ch === 'E') {
          const enem = BABYLON.MeshBuilder.CreateSphere(`e_${r}_${c}`, {diameter: TILE * 0.8}, scene);
          enem.position = new BABYLON.Vector3(w.x, w.y, 0);
          enem.material = new BABYLON.StandardMaterial('m_e', scene);
          enem.material.diffuseColor = new BABYLON.Color3(1, 0.2, 0.2);
          enemies.push({mesh: enem, dir: 1, left: c - 4, right: c + 4});
        }
      }
    }

    // Player
    let player = null;
    let playerState = {vx: 0, vy: 0, onGround: false, onLadder: false};

    for (let r = 0; r < mapH; r++) {
      for (let c = 0; c < mapW; c++) {
        if (MAP[r][c] === 'P') {
          const w = tileToWorld(c, r);
          player = BABYLON.MeshBuilder.CreateSphere('player', {diameter: PLAYER_RADIUS * 2}, scene);
          player.position = new BABYLON.Vector3(w.x, w.y + PLAYER_RADIUS, 0);
          player.material = new BABYLON.StandardMaterial('m_p', scene);
          player.material.diffuseColor = new BABYLON.Color3(0.2, 0.5, 1);
        }
      }
    }

    const controls = {left:false, right:false, up:false, down:false};
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') controls.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') controls.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w') controls.up = true;
      if (e.key === 'ArrowDown' || e.key === 's') controls.down = true;
      if (e.key === ' ' ) { // jump
        if (playerState.onGround && !playerState.onLadder) {
          playerState.vy = 8;
          playerState.onGround = false;
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') controls.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') controls.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w') controls.up = false;
      if (e.key === 'ArrowDown' || e.key === 's') controls.down = false;
    });

    // Helpers
    function isSolidAtColRow(col, row) {
      if (row < 0 || row >= mapH || col < 0 || col >= mapW) return true;
      return MAP[row][col] === '#';
    }

    function isLadderAt(col, row) {
      if (row < 0 || row >= mapH || col < 0 || col >= mapW) return false;
      return MAP[row][col] === 'H';
    }

    function worldToCol(x) { return Math.floor(x / TILE); }
    function worldToRow(y) { return mapH - 1 - Math.floor(y / TILE); }

    // HUD
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerText = 'Gold: 0';
    document.body.appendChild(hud);
    let collected = 0;

    // Game loop
    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000;

      // simple horizontal control
      const speed = 6;
      playerState.vx = 0;
      if (controls.left) playerState.vx = -speed;
      if (controls.right) playerState.vx = speed;

      // check ladder
      const pc = worldToCol(player.position.x);
      const pr = worldToRow(player.position.y - PLAYER_RADIUS);
      playerState.onLadder = isLadderAt(pc, pr) || isLadderAt(pc, worldToRow(player.position.y));

      if (playerState.onLadder && controls.up) {
        playerState.vy = 3;
      } else if (playerState.onLadder && controls.down) {
        playerState.vy = -3;
      } else if (!playerState.onLadder) {
        // gravity
        playerState.vy -= 20 * dt;
      }

      // integrate
      const nextX = player.position.x + playerState.vx * dt;
      let nextY = player.position.y + playerState.vy * dt;

      // vertical collision (ground)
      const footY = nextY - PLAYER_RADIUS - 0.01;
      const footRow = worldToRow(footY);
      const footCol = worldToCol(nextX);
      if (isSolidAtColRow(footCol, footRow)) {
        // place on top of tile
        const tileTop = (mapH - 1 - footRow) * TILE + TILE;
        nextY = tileTop + PLAYER_RADIUS;
        playerState.vy = 0;
        playerState.onGround = true;
      } else {
        playerState.onGround = false;
      }

      // basic horizontal collision to prevent entering walls at player's center
      const centerCol = worldToCol(nextX);
      const centerRow = worldToRow(nextY);
      if (isSolidAtColRow(centerCol, centerRow)) {
        // stop horizontal movement
        // keep x but don't move into wall: snap to current
      } else {
        player.position.x = nextX;
      }

      player.position.y = nextY;

      // keep camera following player
      camera.position.x = player.position.x;
      camera.position.y = player.position.y + 6;
      camera.position.z = -18;

      // collect gold
      for (let i = golds.length - 1; i >= 0; i--) {
        const g = golds[i];
        if (BABYLON.Vector3.DistanceSquared(player.position, g.mesh.position) < (TILE * 0.8) * (TILE * 0.8)) {
          g.mesh.dispose();
          golds.splice(i, 1);
          collected++;
          hud.innerText = `Gold: ${collected}`;
          if (golds.length === 0) {
            setTimeout(()=> alert('You collected all gold! You win!'), 100);
          }
        }
      }

      // enemies
      enemies.forEach((en) => {
        en.mesh.position.x += en.dir * dt * 2.6;
        if (en.mesh.position.x < (en.left * TILE) || en.mesh.position.x > (en.right * TILE)) en.dir *= -1;
        if (BABYLON.Vector3.DistanceSquared(player.position, en.mesh.position) < (TILE * 0.7) * (TILE * 0.7)) {
          // reset player
          scene.freezeMaterials();
          setTimeout(() => location.reload(), 200);
        }
      });
    });

    return scene;
  }

  const scene = createScene();
  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => {
    engine.resize();
  });
})();
