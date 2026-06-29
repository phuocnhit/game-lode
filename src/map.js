(function (global) {
    function createMapController(config) {
        const {
            scene,
            shadowGen,
            brickMat,
            goldMat,
            ladderMat,
            ropeMat,
            enemyMat,
            tileSize = 2,
            enemyPathZ = 1.2,
            mapData,
        } = config;

        const map = mapData || [
           
        ];

        const BRICK_WIDTH_SCALE = 1.2;
        const GRID_STEP_Y = tileSize * BRICK_WIDTH_SCALE;

        const mapWorldWidth = map[0].length * tileSize;
        const mapWorldHeight = map.length * GRID_STEP_Y;
        const mapCenterX = (map[0].length - 1) * tileSize * 0.5;
        const mapCenterY = mapWorldHeight * 0.5;

        const solids = [];
        const ladders = [];
        const ropes = [];
        const golds = [];
        const enemies = [];
        const dugHoles = new Set();
        let playerSpawn = new BABYLON.Vector3(4, 12, 0);
        let playerMesh = null;

        function holeKey(col, row) {
            return `${col},${row}`;
        }

        function createGlbTileAt(worldX, worldY, glbFileName, metadata) {
            const collider = BABYLON.MeshBuilder.CreateBox("tileCollider", {
                width: tileSize,
                height: tileSize * BRICK_WIDTH_SCALE,
                depth: tileSize,
            }, scene);
            collider.position.set(worldX, worldY, 0);
            collider.isVisible = false;
            collider.isPickable = false;
            collider.metadata = Object.assign({ isIce: false }, metadata || {});
            solids.push(collider);

            BABYLON.SceneLoader.ImportMesh(
                "",
                "assets/",
                glbFileName,
                scene,
                (meshes) => {
                    const root = new BABYLON.TransformNode("tileRoot", scene);
                    root.position.set(0, 0, 0);
                    root.scaling.set(1, 1, 1);

                    function tuneIceMaterial(material) {
                        if (!material) return;

                        if (typeof material.metallic === "number") {
                            material.metallic = 0;
                        }
                        if (typeof material.roughness === "number") {
                            material.roughness = Math.max(material.roughness, 0.9);
                        }
                        if (typeof material.environmentIntensity === "number") {
                            material.environmentIntensity = Math.min(material.environmentIntensity, 0.35);
                        }
                        if (typeof material.specularIntensity === "number") {
                            material.specularIntensity = Math.min(material.specularIntensity, 0.08);
                        }
                        if (material.specularColor && typeof material.specularColor.copyFromFloats === "function") {
                            material.specularColor.copyFromFloats(0.08, 0.08, 0.08);
                        }
                    }

                    for (const mesh of meshes) {
                        if (!(mesh instanceof BABYLON.AbstractMesh)) continue;
                        mesh.parent = root;
                        mesh.receiveShadows = true;
                        shadowGen.addShadowCaster(mesh);

                        if (metadata && metadata.isIce) {
                            tuneIceMaterial(mesh.material);
                        }
                    }

                    const targetSize = new BABYLON.Vector3(tileSize, tileSize * BRICK_WIDTH_SCALE, tileSize);
                    const initialBounds = root.getHierarchyBoundingVectors(true);
                    const initialSize = initialBounds.max.subtract(initialBounds.min);
                    const safeX = initialSize.x > 0.0001 ? initialSize.x : 1;
                    const safeY = initialSize.y > 0.0001 ? initialSize.y : 1;
                    const safeZ = initialSize.z > 0.0001 ? initialSize.z : 1;

                    root.scaling.set(
                        targetSize.x / safeX,
                        targetSize.y / safeY,
                        targetSize.z / safeZ
                    );

                    const fittedBounds = root.getHierarchyBoundingVectors(true);
                    const fittedCenter = fittedBounds.min.add(fittedBounds.max).scale(0.5);
                    root.position.set(
                        worldX - fittedCenter.x,
                        worldY - fittedCenter.y,
                        -fittedCenter.z
                    );

                    collider.metadata.glbRoot = root;
                }
            );

            return collider;
        }

        function createBrickAt(worldX, worldY) {
            return createGlbTileAt(worldX, worldY, "Brick.glb", { isIce: false });
        }

        function createIceAt(worldX, worldY) {
            return createGlbTileAt(worldX, worldY, "Ice.glb", { isIce: true });
        }

        for (let y = 0; y < map.length; y++) {
            for (let x = 0; x < map[y].length; x++) {
                const char = map[y][x];
                const worldX = x * tileSize;
                const worldY = (map.length - y) * GRID_STEP_Y;

                if (char === "P") {
                    playerSpawn = new BABYLON.Vector3(worldX, worldY, 0);
                    continue;
                }

                if (char === "E") {
                    const enemy = BABYLON.MeshBuilder.CreateBox("enemy", { size: 1.5 }, scene);
                    enemy.position.set(worldX, worldY, 0);
                    enemy.material = enemyMat;
                    shadowGen.addShadowCaster(enemy);
                    enemies.push({
                        mesh: enemy,
                        spawnX: worldX,
                        spawnY: worldY,
                        pathLine: null,
                        moveFrom: new BABYLON.Vector2(worldX, worldY),
                        moveTo: new BABYLON.Vector2(worldX, worldY),
                        moveProgress: 1,
                        releasePhase: null,
                        releaseTarget: null,
                        falling: false,
                        fallTargetRow: null,
                        trappedTimer: 0,
                    });
                    continue;
                }

                if (char === "#") {
                    createBrickAt(worldX, worldY);
                }

                if (char === "I") {
                    createIceAt(worldX, worldY);
                }

                if (char === "L") {
                    const ladderDepth = tileSize * 0.04;
                    const ladder = BABYLON.MeshBuilder.CreateBox("l", {
                        width: tileSize,
                        height: GRID_STEP_Y,
                        depth: ladderDepth,
                    }, scene);
                    ladder.position.set(worldX, worldY, (tileSize / 2) + (ladderDepth / 2));
                    ladder.material = ladderMat;
                    ladders.push(ladder);
                }

                if (char === "S") {
                    const ropeThickness = tileSize * 0.14;
                    const rope = BABYLON.MeshBuilder.CreateBox("rope", {
                        width: tileSize,
                        height: ropeThickness,
                        depth: ropeThickness,
                    }, scene);
                    rope.position.set(worldX, worldY, (tileSize / 2) + (ropeThickness / 2));
                    rope.material = ropeMat || ladderMat;
                    rope.receiveShadows = true;
                    ropes.push(rope);
                }

                if (char === "G") {
                    const gold = BABYLON.MeshBuilder.CreateCylinder("g", {
                        diameter: 1,
                        height: 0.5,
                    }, scene);
                    gold.position.set(worldX, worldY, 0);
                    gold.material = goldMat;
                    shadowGen.addShadowCaster(gold);
                    golds.push(gold);
                }
            }
        }

        function clamp(v, min, max) {
            return Math.max(min, Math.min(max, v));
        }

        function worldXToCol(worldX) {
            const col = Math.round(worldX / tileSize);
            return clamp(col, 0, map[0].length - 1);
        }

        function worldYToRow(worldY) {
            const row = map.length - Math.round(worldY / GRID_STEP_Y);
            return clamp(row, 0, map.length - 1);
        }

        function rowToWorldY(row) {
            return (map.length - row) * GRID_STEP_Y;
        }

        function isInsideMap(col, row) {
            return row >= 0 && row < map.length && col >= 0 && col < map[0].length;
        }

        function isSolidCell(col, row) {
            if (!isInsideMap(col, row)) return true;
            return map[row][col] === "#" || map[row][col] === "I";
        }

        function isLadderCell(col, row) {
            if (!isInsideMap(col, row)) return false;
            return map[row][col] === "L";
        }

        function isRopeCell(col, row) {
            if (!isInsideMap(col, row)) return false;
            return map[row][col] === "S";
        }

        function canStandAt(col, row) {
            if (isLadderCell(col, row)) return true;
            if (isLadderCell(col, row + 1)) return true;
            if (isRopeCell(col, row)) return true;
            return isSolidCell(col, row + 1);
        }

        function getPathNeighbors(col, row) {
            const result = [];

            const canWalkTo = (nextCol, nextRow) => {
                if (isSolidCell(nextCol, nextRow)) return false;
                return canStandAt(nextCol, nextRow) || isRopeCell(nextCol, nextRow);
            };

            if (canWalkTo(col + 1, row)) result.push({ col: col + 1, row });
            if (canWalkTo(col - 1, row)) result.push({ col: col - 1, row });

            if (isLadderCell(col, row) && canWalkTo(col, row - 1)) {
                result.push({ col, row: row - 1 });
            }

            if ((isLadderCell(col, row) || isLadderCell(col, row + 1)) && canWalkTo(col, row + 1)) {
                result.push({ col, row: row + 1 });
            }

            // Allow dropping down from rope to continue chasing player.
            if (isRopeCell(col, row) && canWalkTo(col, row + 1)) {
                result.push({ col, row: row + 1 });
            }

            return result;
        }

        function findPath(start, end) {
            const queue = [{
                col: start.col,
                row: start.row,
                path: [{ col: start.col, row: start.row }],
            }];
            const visited = new Set();
            let bestPath = [];
            let bestDist = Number.POSITIVE_INFINITY;

            while (queue.length) {
                const node = queue.shift();
                const key = `${node.col},${node.row}`;

                if (visited.has(key)) continue;
                visited.add(key);

                const dist = Math.abs(node.col - end.col) + Math.abs(node.row - end.row);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPath = node.path;
                }

                if (node.col === end.col && node.row === end.row) {
                    return node.path;
                }

                for (const next of getPathNeighbors(node.col, node.row)) {
                    queue.push({
                        col: next.col,
                        row: next.row,
                        path: [...node.path, next],
                    });
                }
            }

            return bestPath;
        }

        function gridToWorldPosition(col, row, z = 0) {
            return new BABYLON.Vector3(col * tileSize, rowToWorldY(row), z);
        }

        function getEnemyPath(enemyMesh) {
            const start = {
                col: worldXToCol(enemyMesh.position.x),
                row: worldYToRow(enemyMesh.position.y),
            };

            const target = playerMesh || enemyMesh;
            const end = {
                col: worldXToCol(target.position.x),
                row: worldYToRow(target.position.y),
            };

            return findPath(start, end);
        }

        function updateEnemyPathLine(enemy, path) {
            const points = path.map((node) => gridToWorldPosition(node.col, node.row, enemyPathZ));

            if (points.length < 2) {
                if (enemy.pathLine) {
                    enemy.pathLine.dispose();
                    enemy.pathLine = null;
                }
                return;
            }

            if (!enemy.pathLine) {
                enemy.pathLine = BABYLON.MeshBuilder.CreateLines("enemyPath", {
                    points,
                    updatable: true,
                }, scene);
                enemy.pathLine.color = new BABYLON.Color3(1, 0.1, 0.1);
                enemy.pathLine.isPickable = false;
                enemy.pathLine.renderingGroupId = 2;
            } else {
                BABYLON.MeshBuilder.CreateLines("enemyPath", {
                    points,
                    instance: enemy.pathLine,
                }, scene);
            }
        }

        function hasSolidAtGrid(col, row) {
            if (!isInsideMap(col, row)) return true;
            const worldX = col * tileSize;
            const worldY = rowToWorldY(row);
            return solids.some((s) =>
                Math.abs(s.position.x - worldX) < 0.1 &&
                Math.abs(s.position.y - worldY) < 0.1
            );
        }

        function setPlayerMesh(mesh) {
            playerMesh = mesh;
        }

        return {
            map,
            tileSize,
            mapWorldWidth,
            mapWorldHeight,
            mapCenterX,
            mapCenterY,
            solids,
            ladders,
            ropes,
            golds,
            enemies,
            dugHoles,
            playerSpawn,
            brickHalfHeight: (tileSize * BRICK_WIDTH_SCALE) / 2,
            holeKey,
            createBrickAt,
            createIceAt,
            clamp,
            worldXToCol,
            worldYToRow,
            rowToWorldY,
            isInsideMap,
            isSolidCell,
            isLadderCell,
            isRopeCell,
            canStandAt,
            findPath,
            gridToWorldPosition,
            getEnemyPath,
            updateEnemyPathLine,
            hasSolidAtGrid,
            setPlayerMesh,
        };
    }

    global.createMapController = createMapController;
})(window);
