(function (global) {
    function createEnemyController(config) {
        const {
            enemies,
            map,
            tileSize,
            dugHoles,
            holeKey,
            isInsideMap,
            isSolidCell,
            isLadderCell,
            isRopeCell,
            worldXToCol,
            worldYToRow,
            rowToWorldY,
            hasSolidAtGrid,
            getEnemyPath,
            gridToWorldPosition,
            player,
            enemyStepDuration = 0.45,
            enemyFallSpeed = 7,
            enemyTrapDuration = 2.2,
        } = config;

        function hasTrappedEnemyAtGrid(col, row, ignoreEnemy) {
            return enemies.some((enemy) => {
                if (enemy === ignoreEnemy) return false;
                if (enemy.trappedTimer <= 0) return false;
                const enemyCol = worldXToCol(enemy.mesh.position.x);
                const enemyRow = worldYToRow(enemy.mesh.position.y);
                return enemyCol === col && enemyRow === row;
            });
        }

        function isEnemyOnLadder(enemy) {
            const col = worldXToCol(enemy.mesh.position.x);
            const row = worldYToRow(enemy.mesh.position.y);
            const cellCenterX = col * tileSize;
            const xAligned = Math.abs(enemy.mesh.position.x - cellCenterX) < 0.55;
            if (!xAligned) return false;
            return isLadderCell(col, row) || isLadderCell(col, row + 1);
        }

        function isEnemyOnRope(enemy) {
            const col = worldXToCol(enemy.mesh.position.x);
            const row = worldYToRow(enemy.mesh.position.y);
            const rowY = rowToWorldY(row);
            const yAligned = Math.abs(enemy.mesh.position.y - rowY) < (tileSize * 0.45);
            return yAligned && !!isRopeCell && isRopeCell(col, row);
        }

        function canEnemyStandAtFromMap(col, row) {
            if (!isInsideMap(col, row)) return false;
            if (isSolidCell(col, row)) return false;
            if (isLadderCell(col, row)) return true;
            if (isLadderCell(col, row + 1)) return true;
            return isSolidCell(col, row + 1);
        }

        function updateEnemyFalling(enemy, dt) {
            if (isEnemyOnLadder(enemy) || isEnemyOnRope(enemy)) {
                enemy.falling = false;
                enemy.fallTargetRow = null;
                return false;
            }

            const col = worldXToCol(enemy.mesh.position.x);
            const row = worldYToRow(enemy.mesh.position.y);
            const hasSupport = hasSolidAtGrid(col, row + 1) || hasTrappedEnemyAtGrid(col, row + 1, enemy);

            if (!enemy.falling && !hasSupport) {
                enemy.falling = true;
                enemy.fallTargetRow = Math.min(map.length - 1, row + 1);
            }

            if (!enemy.falling) return false;

            const targetRow = enemy.fallTargetRow === null
                ? Math.min(map.length - 1, row + 1)
                : enemy.fallTargetRow;
            const targetY = rowToWorldY(targetRow);

            enemy.moveProgress = 1;
            enemy.mesh.position.y -= enemyFallSpeed * dt;
            if (enemy.mesh.position.y < targetY) {
                enemy.mesh.position.y = targetY;
            }

            if (enemy.mesh.position.y <= targetY + 0.02) {
                enemy.mesh.position.y = targetY;
                enemy.mesh.position.x = col * tileSize;
                enemy.falling = false;
                enemy.fallTargetRow = null;

                const landedCol = worldXToCol(enemy.mesh.position.x);
                const landedRow = worldYToRow(enemy.mesh.position.y);
                const onLadderCell = isLadderCell(landedCol, landedRow) || isLadderCell(landedCol, landedRow + 1);

                if (!onLadderCell && dugHoles.has(holeKey(landedCol, landedRow))) {
                    enemy.trappedTimer = Math.max(enemy.trappedTimer, enemyTrapDuration);
                }

                return false;
            }

            return true;
        }

        function isEnemyInTrap(enemy) {
            const col = worldXToCol(enemy.mesh.position.x);
            const row = worldYToRow(enemy.mesh.position.y);

            if (isLadderCell(col, row) || isLadderCell(col, row + 1)) return false;

            const nearbyCols = [col - 1, col, col + 1].filter((c) =>
                Math.abs(enemy.mesh.position.x - (c * tileSize)) <= (tileSize * 0.55)
            );

            let inDugHole = false;
            let hasFloorBelow = false;
            for (const c of nearbyCols) {
                if (!isInsideMap(c, row)) continue;
                if (!dugHoles.has(holeKey(c, row))) continue;
                inDugHole = true;
                if (hasSolidAtGrid(c, row + 1)) {
                    hasFloorBelow = true;
                }
            }

            return inDugHole && hasFloorBelow;
        }

        function tryReleaseEnemyFromTrap(enemy) {
            const col = worldXToCol(enemy.mesh.position.x);
            const row = worldYToRow(enemy.mesh.position.y);
            const upRow = row - 1;
            const playerCol = worldXToCol(player.position.x);

            const releaseCandidates = [
                { c: col - 1, r: upRow },
                { c: col + 1, r: upRow },
                { c: col, r: upRow },
            ];

            let releaseCell = null;
            let bestScore = Number.POSITIVE_INFINITY;
            for (const candidate of releaseCandidates) {
                if (!isInsideMap(candidate.c, candidate.r)) continue;
                if (!canEnemyStandAtFromMap(candidate.c, candidate.r)) continue;

                const leftSolid = isSolidCell(candidate.c - 1, candidate.r);
                const rightSolid = isSolidCell(candidate.c + 1, candidate.r);
                const belowSolid = isSolidCell(candidate.c, candidate.r + 1);
                const inTrapAgain = leftSolid && rightSolid && belowSolid;
                if (inTrapAgain) continue;

                const onLadder = isLadderCell(candidate.c, candidate.r) || isLadderCell(candidate.c, candidate.r + 1);
                const supported = belowSolid || onLadder;
                const horizontalDistToPlayer = Math.abs(candidate.c - playerCol);
                const sameRowPenalty = candidate.r === row ? 0 : 0.15;
                const unsupportedPenalty = supported ? 0 : 10;

                const score = horizontalDistToPlayer + sameRowPenalty + unsupportedPenalty;
                if (score < bestScore) {
                    bestScore = score;
                    releaseCell = candidate;
                }
            }

            if (!releaseCell) {
                enemy.trappedTimer = 0.4;
                return;
            }

            if (!isInsideMap(col, upRow) || isSolidCell(col, upRow)) {
                enemy.trappedTimer = 0.4;
                return;
            }

            const releaseX = releaseCell.c * tileSize;
            const releaseY = rowToWorldY(releaseCell.r);
            const upX = col * tileSize;
            const upY = rowToWorldY(upRow);

            enemy.moveFrom.x = enemy.mesh.position.x;
            enemy.moveFrom.y = enemy.mesh.position.y;
            enemy.moveTo.x = upX;
            enemy.moveTo.y = upY;
            enemy.moveProgress = 0;
            enemy.releasePhase = "toUp";
            enemy.releaseTarget = { x: releaseX, y: releaseY };
            enemy.falling = false;
            enemy.fallTargetRow = null;
        }

        function startEnemyStep(enemy, nextNode) {
            const target = gridToWorldPosition(nextNode.col, nextNode.row, enemy.mesh.position.z);
            enemy.moveFrom.x = enemy.mesh.position.x;
            enemy.moveFrom.y = enemy.mesh.position.y;
            enemy.moveTo.x = target.x;
            enemy.moveTo.y = target.y;
            enemy.moveProgress = 0;
        }

        function updateEnemyAI(dt) {
            for (const enemy of enemies) {
                if (enemy.trappedTimer > 0) {
                    enemy.trappedTimer = Math.max(0, enemy.trappedTimer - dt);
                    if (enemy.trappedTimer <= 0) {
                        tryReleaseEnemyFromTrap(enemy);
                    }
                    continue;
                }

                if (enemy.moveProgress < 1) {
                    enemy.moveProgress = Math.min(1, enemy.moveProgress + (dt / enemyStepDuration));
                    enemy.mesh.position.x = BABYLON.Scalar.Lerp(enemy.moveFrom.x, enemy.moveTo.x, enemy.moveProgress);
                    enemy.mesh.position.y = BABYLON.Scalar.Lerp(enemy.moveFrom.y, enemy.moveTo.y, enemy.moveProgress);

                    if (enemy.moveProgress >= 1 && enemy.releasePhase === "toUp" && enemy.releaseTarget) {
                        const target = enemy.releaseTarget;
                        const atTarget =
                            Math.abs(enemy.mesh.position.x - target.x) < 0.01 &&
                            Math.abs(enemy.mesh.position.y - target.y) < 0.01;

                        if (atTarget) {
                            enemy.releasePhase = null;
                            enemy.releaseTarget = null;
                        } else {
                            enemy.moveFrom.x = enemy.mesh.position.x;
                            enemy.moveFrom.y = enemy.mesh.position.y;
                            enemy.moveTo.x = target.x;
                            enemy.moveTo.y = target.y;
                            enemy.moveProgress = 0;
                            enemy.releasePhase = "toEdge";
                        }
                    } else if (enemy.moveProgress >= 1 && enemy.releasePhase === "toEdge") {
                        enemy.releasePhase = null;
                        enemy.releaseTarget = null;
                    }

                    continue;
                }

                const isFalling = updateEnemyFalling(enemy, dt);
                if (isFalling) {
                    continue;
                }

                if (isEnemyInTrap(enemy)) {
                    enemy.trappedTimer = enemyTrapDuration;
                    enemy.moveProgress = 1;
                    continue;
                }

                const path = getEnemyPath(enemy.mesh);
                if (path.length <= 1) continue;

                startEnemyStep(enemy, path[1]);
                enemy.moveProgress = Math.min(1, dt / enemyStepDuration);
                enemy.mesh.position.x = BABYLON.Scalar.Lerp(enemy.moveFrom.x, enemy.moveTo.x, enemy.moveProgress);
                enemy.mesh.position.y = BABYLON.Scalar.Lerp(enemy.moveFrom.y, enemy.moveTo.y, enemy.moveProgress);
            }
        }

        function respawnEnemyInHole(targetCol, targetRow) {
            for (const enemy of enemies) {
                const enemyCol = worldXToCol(enemy.mesh.position.x);
                const enemyRow = worldYToRow(enemy.mesh.position.y);
                if (enemyCol !== targetCol || enemyRow !== targetRow) continue;

                enemy.trappedTimer = 0;
                enemy.mesh.position.x = enemy.spawnX;
                enemy.mesh.position.y = enemy.spawnY;
                enemy.falling = false;
                enemy.fallTargetRow = null;
                enemy.releasePhase = null;
                enemy.releaseTarget = null;
                enemy.moveFrom.x = enemy.mesh.position.x;
                enemy.moveFrom.y = enemy.mesh.position.y;
                enemy.moveTo.x = enemy.mesh.position.x;
                enemy.moveTo.y = enemy.mesh.position.y;
                enemy.moveProgress = 1;
            }
        }

        return {
            updateEnemyAI,
            respawnEnemyInHole,
        };
    }

    global.createEnemyController = createEnemyController;
})(window);
