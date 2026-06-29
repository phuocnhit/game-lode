(function (global) {
    function createPlayerController(config) {
        const {
            scene,
            shadowGen,
            playerMat,
            playerSpawn,
            tileSize,
            solids,
            ladders,
            golds,
            enemies,
            dugHoles,
            holeKey,
            createBrickAt,
            createIceAt,
            worldXToCol,
            worldYToRow,
            rowToWorldY,
            isRopeCell,
            enemyController: initialEnemyController,
            brickHalfHeight: configBrickHalfHeight,
            brickRespawnMs = 8000,
        } = config;

        let enemyController = initialEnemyController;

        const player = BABYLON.MeshBuilder.CreateCapsule("player", { radius: 0.6, height: 1.5 }, scene);
        player.position.copyFrom(playerSpawn);
        player.material = playerMat;
        shadowGen.addShadowCaster(player);

        const playerHalfHeight = 0.75;
        const blockHalfHeight = configBrickHalfHeight !== undefined ? configBrickHalfHeight : tileSize / 2;
        const speed = 0.1;
        const gravity = -0.02;
        const ladderStepThreshold = 0.55;
        const ladderTopCatch = 0.45;

        let velocityY = 0;
        let onGround = false;
        let onLadder = false;
        let onRope = false;
        let ropeDropTimer = 0;
        let fallingLock = false;
        let targetFallX = 0;

        const keys = {};
        const virtualKeys = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false,
        };

        window.addEventListener("keydown", (e) => {
            keys[e.key] = true;
        });
        window.addEventListener("keyup", (e) => {
            keys[e.key] = false;
        });

        function isPressed(key) {
            return !!keys[key] || !!virtualKeys[key];
        }

        const joystickRoot = document.getElementById("virtualJoystick");
        const joystickStick = joystickRoot.querySelector(".stick");
        const hasTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
        if (hasTouch) {
            joystickRoot.style.display = "block";
        }

        const joystickState = {
            pointerId: null,
            x: 0,
            y: 0,
        };
        const joystickMaxRadius = 44;
        const joystickThreshold = 0.35;

        function applyJoystickDirection(dx, dy) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            const clampedDistance = Math.min(distance, joystickMaxRadius);
            const scale = distance > 0 ? (clampedDistance / distance) : 0;

            const stickX = dx * scale;
            const stickY = dy * scale;
            joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

            joystickState.x = stickX / joystickMaxRadius;
            joystickState.y = stickY / joystickMaxRadius;

            virtualKeys.ArrowLeft = joystickState.x < -joystickThreshold;
            virtualKeys.ArrowRight = joystickState.x > joystickThreshold;
            virtualKeys.ArrowUp = joystickState.y < -joystickThreshold;
            virtualKeys.ArrowDown = joystickState.y > joystickThreshold;
        }

        function resetJoystick() {
            joystickStick.style.transform = "translate(0px, 0px)";
            joystickState.pointerId = null;
            joystickState.x = 0;
            joystickState.y = 0;
            virtualKeys.ArrowLeft = false;
            virtualKeys.ArrowRight = false;
            virtualKeys.ArrowUp = false;
            virtualKeys.ArrowDown = false;
        }

        function updateJoystickFromEvent(event) {
            const bounds = joystickRoot.getBoundingClientRect();
            const centerX = bounds.left + bounds.width / 2;
            const centerY = bounds.top + bounds.height / 2;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            applyJoystickDirection(dx, dy);
        }

        joystickRoot.addEventListener("pointerdown", (event) => {
            if (!hasTouch) return;
            joystickState.pointerId = event.pointerId;
            joystickRoot.setPointerCapture(event.pointerId);
            updateJoystickFromEvent(event);
        });

        joystickRoot.addEventListener("pointermove", (event) => {
            if (joystickState.pointerId !== event.pointerId) return;
            updateJoystickFromEvent(event);
        });

        joystickRoot.addEventListener("pointerup", (event) => {
            if (joystickState.pointerId !== event.pointerId) return;
            resetJoystick();
        });

        joystickRoot.addEventListener("pointercancel", (event) => {
            if (joystickState.pointerId !== event.pointerId) return;
            resetJoystick();
        });

        function checkGround() {
            onGround = false;
            for (const s of solids) {
                if (Math.abs(s.position.x - player.position.x) < 1 &&
                    Math.abs(s.position.y - (player.position.y - 1)) < 1) {
                    player.position.y = s.position.y + blockHalfHeight + playerHalfHeight;
                    velocityY = 0;
                    onGround = true;
                }
            }

            if (!onGround) {
                for (const enemy of enemies) {
                    if (enemy.trappedTimer <= 0) continue;
                    if (Math.abs(enemy.mesh.position.x - player.position.x) < 1 &&
                        Math.abs(enemy.mesh.position.y - (player.position.y - 1)) < 1) {
                        player.position.y = enemy.mesh.position.y + blockHalfHeight + playerHalfHeight;
                        velocityY = 0;
                        onGround = true;
                        break;
                    }
                }
            }
        }

        function getStandingBrick() {
            for (const s of solids) {
                if (Math.abs(s.position.x - player.position.x) < 1 &&
                    Math.abs(s.position.y - (player.position.y - 1)) < 1) {
                    return s;
                }
            }
            return null;
        }

        function isBlockedAtX(nextX) {
            const verticalReach = blockHalfHeight + playerHalfHeight - 0.05;
            for (const s of solids) {
                const hitX = Math.abs(s.position.x - nextX) < (blockHalfHeight + 0.75);
                const hitY = Math.abs(s.position.y - player.position.y) < verticalReach;
                if (hitX && hitY) return true;
            }
            return false;
        }

        function getCurrentLadder() {
            let nearest = null;
            let nearestDist = Number.POSITIVE_INFINITY;
            for (const l of ladders) {
                const dx = Math.abs(l.position.x - player.position.x);
                const playerFeetY = player.position.y - playerHalfHeight;
                const ladderTopY = l.position.y + blockHalfHeight;
                const ladderBottomY = l.position.y - blockHalfHeight;
                const feetInsideLadder = playerFeetY <= ladderTopY + ladderTopCatch && playerFeetY >= ladderBottomY - 0.05;

                if (dx < 1 && feetInsideLadder) {
                    const dy = Math.abs(l.position.y - player.position.y);
                    const dist = dx + dy;
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = l;
                    }
                }
            }
            return nearest;
        }

        function checkLadder() {
            onLadder = false;
            for (const l of ladders) {
                const dx = Math.abs(l.position.x - player.position.x);
                const playerFeetY = player.position.y - playerHalfHeight;
                const ladderTopY = l.position.y + blockHalfHeight;
                const ladderBottomY = l.position.y - blockHalfHeight;
                const feetInsideLadder = playerFeetY <= ladderTopY + ladderTopCatch && playerFeetY >= ladderBottomY - 0.05;
                if (dx < 1 && feetInsideLadder) onLadder = true;
            }
        }

        function checkRope() {
            if (ropeDropTimer > 0) {
                onRope = false;
                return;
            }

            const col = worldXToCol(player.position.x);
            const row = worldYToRow(player.position.y);
            if (!isRopeCell || !isRopeCell(col, row)) {
                onRope = false;
                return;
            }

            const ropeY = rowToWorldY(row);
            const nearRopeHeight = Math.abs(player.position.y - ropeY) <= (tileSize * 0.45);
            if (!nearRopeHeight) {
                onRope = false;
                return;
            }

            onRope = true;
            player.position.y = BABYLON.Scalar.Lerp(player.position.y, ropeY, 0.4);
            if (Math.abs(player.position.y - ropeY) < 0.02) {
                player.position.y = ropeY;
            }
        }

        function tryStepOffLadderToBrick(direction, nextX) {
            if (!onLadder) return false;
            const currentLadder = getCurrentLadder();
            if (!currentLadder) return false;

            const targetBrickX = currentLadder.position.x + direction * tileSize;
            const playerFeetY = player.position.y - playerHalfHeight;

            let targetStandY = null;
            let targetBrickTopY = null;
            let nearestDiff = Number.POSITIVE_INFINITY;

            for (const s of solids) {
                if (Math.abs(s.position.x - targetBrickX) > 0.1) continue;

                const brickTopY = s.position.y + blockHalfHeight;
                const standY = brickTopY + playerHalfHeight;
                const canReachBrickSurface = playerFeetY >= (brickTopY - ladderStepThreshold);
                const reachableStep = Math.abs(player.position.y - standY) <= (playerHalfHeight + ladderStepThreshold);

                if (canReachBrickSurface && reachableStep) {
                    const diff = Math.abs(player.position.y - standY);
                    if (diff < nearestDiff) {
                        nearestDiff = diff;
                        targetStandY = standY;
                        targetBrickTopY = brickTopY;
                    }
                }
            }

            if (targetStandY === null) return false;

            const sideBlockReachY = blockHalfHeight + playerHalfHeight - 0.05;
            const blockedByWallAboveTarget = solids.some((s) =>
                Math.abs(s.position.x - targetBrickX) < 0.1 &&
                (s.position.y + blockHalfHeight) > (targetBrickTopY + 0.05) &&
                Math.abs(s.position.y - player.position.y) < sideBlockReachY
            );
            if (blockedByWallAboveTarget) return false;

            player.position.x = nextX;
            player.position.y = targetStandY;
            velocityY = 0;
            onGround = true;
            onLadder = false;
            fallingLock = false;
            return true;
        }

        function tryEnterLadderFromBrick() {
            if (onLadder) return false;
            if (!isPressed("ArrowDown") && !isPressed("ArrowUp")) return false;

            const standingBrick = getStandingBrick();
            if (!standingBrick) return false;

            const playerFeetY = player.position.y - playerHalfHeight;
            let targetLadder = null;
            let nearestDx = Number.POSITIVE_INFINITY;

            for (const l of ladders) {
                const dx = Math.abs(l.position.x - player.position.x);
                if (dx > 0.85) continue;

                const ladderTopY = l.position.y + blockHalfHeight;
                const ladderBottomY = l.position.y - blockHalfHeight;
                const canEnterDown = isPressed("ArrowDown") && Math.abs(playerFeetY - ladderTopY) <= (playerHalfHeight + ladderStepThreshold);
                const canEnterUp = isPressed("ArrowUp") && Math.abs(playerFeetY - ladderBottomY) <= (playerHalfHeight + ladderStepThreshold);

                if (canEnterDown || canEnterUp) {
                    if (dx < nearestDx) {
                        nearestDx = dx;
                        targetLadder = l;
                    }
                }
            }

            if (!targetLadder) return false;

            player.position.x = targetLadder.position.x;
            onLadder = true;
            onGround = false;
            velocityY = 0;
            fallingLock = false;
            return true;
        }

        function digBrick(direction) {
            const playerFeetY = player.position.y - playerHalfHeight;
            const standingRow = worldYToRow(playerFeetY - blockHalfHeight);
            const standingBlockY = rowToWorldY(standingRow);
            const playerColX = Math.round(player.position.x / tileSize) * tileSize;

            const targetX = playerColX + direction * tileSize;
            const targetY = standingBlockY;
            const targetCol = worldXToCol(targetX);
            const targetRow = worldYToRow(targetY);

            const blockIndex = solids.findIndex((s) =>
                Math.abs(s.position.x - targetX) < 0.1 &&
                Math.abs(s.position.y - targetY) < 0.1
            );
            if (blockIndex === -1) return;

            const aboveBlockY = rowToWorldY(Math.max(0, targetRow - 1));
            const hasBlockAbove = solids.some((s) =>
                Math.abs(s.position.x - targetX) < 0.1 &&
                Math.abs(s.position.y - aboveBlockY) < 0.1
            );
            if (hasBlockAbove) return;

            const removedBlock = solids[blockIndex];
            const restoreX = removedBlock.position.x;
            const restoreY = removedBlock.position.y;

            const wasIce = !!(removedBlock.metadata && removedBlock.metadata.isIce);
            const glbRoot = removedBlock.metadata && removedBlock.metadata.glbRoot;
            solids.splice(blockIndex, 1);
            if (glbRoot) {
                glbRoot.getChildMeshes(false).forEach((m) => m.dispose());
                glbRoot.dispose();
            }
            removedBlock.dispose();
            dugHoles.add(holeKey(targetCol, targetRow));

            setTimeout(() => {
                if (enemyController) {
                    enemyController.respawnEnemyInHole(targetCol, targetRow);
                }
                dugHoles.delete(holeKey(targetCol, targetRow));
                if (wasIce && typeof createIceAt === "function") {
                    createIceAt(restoreX, restoreY);
                } else {
                    createBrickAt(restoreX, restoreY);
                }
            }, brickRespawnMs);
        }

        window.addEventListener("keydown", (e) => {
            if (e.repeat) return;
            if (e.key === "a" || e.key === "A") digBrick(-1);
            if (e.key === "b" || e.key === "B") digBrick(1);
        });

        const digLeftBtn = document.getElementById("digLeft");
        const digRightBtn = document.getElementById("digRight");
        if (digLeftBtn) {
            digLeftBtn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                digBrick(-1);
            });
        }
        if (digRightBtn) {
            digRightBtn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                digBrick(1);
            });
        }

        let goldCount = 0;

        function update(dt) {
            ropeDropTimer = Math.max(0, ropeDropTimer - dt);

            if (!fallingLock) {
                if (isPressed("ArrowLeft")) {
                    const nextX = player.position.x - speed;
                    const steppedFromLadder = tryStepOffLadderToBrick(-1, nextX);
                    if (!steppedFromLadder && !isBlockedAtX(nextX)) {
                        player.position.x = nextX;
                    }
                }
                if (isPressed("ArrowRight")) {
                    const nextX = player.position.x + speed;
                    const steppedFromLadder = tryStepOffLadderToBrick(1, nextX);
                    if (!steppedFromLadder && !isBlockedAtX(nextX)) {
                        player.position.x = nextX;
                    }
                }
            } else {
                player.position.x = BABYLON.Scalar.Lerp(player.position.x, targetFallX, 0.25);
            }

            tryEnterLadderFromBrick();
            checkLadder();
            checkRope();

            if (onLadder) {
                let canClimbUp = true;
                const currentLadder = getCurrentLadder();
                if (currentLadder) {
                    if (isPressed("ArrowDown") || isPressed("ArrowUp")) {
                        player.position.x = BABYLON.Scalar.Lerp(player.position.x, currentLadder.position.x, 0.45);
                        if (Math.abs(player.position.x - currentLadder.position.x) < 0.02) {
                            player.position.x = currentLadder.position.x;
                        }
                    }

                    const ladderAbove = ladders.some((l) =>
                        Math.abs(l.position.x - currentLadder.position.x) < 0.1 &&
                        l.position.y > currentLadder.position.y &&
                        (l.position.y - currentLadder.position.y) <= tileSize + 0.1
                    );

                    if (!ladderAbove) {
                        const topY = currentLadder.position.y + blockHalfHeight + playerHalfHeight;
                        if (player.position.y >= topY) {
                            player.position.y = topY;
                            canClimbUp = false;
                        }
                    }
                }

                if (isPressed("ArrowUp") && canClimbUp) {
                    player.position.y += speed;
                }
                if (isPressed("ArrowDown")) {
                    player.position.y -= speed;
                }
                velocityY = 0;
                fallingLock = false;
            } else if (onRope) {
                velocityY = 0;
                fallingLock = false;

                if (isPressed("ArrowDown")) {
                    onRope = false;
                    ropeDropTimer = 0.18;
                    player.position.y -= speed;
                }
            } else {
                checkGround();

                if (!onGround) {
                    velocityY += gravity;
                    if (velocityY < 0) velocityY = -speed;
                    player.position.y += velocityY;
                    checkGround();
                } else {
                    velocityY = 0;
                }

                if (!onGround && !onLadder && !onRope && velocityY < 0 && !fallingLock) {
                    fallingLock = true;
                    targetFallX = Math.round(player.position.x / tileSize) * tileSize;
                }
            }

            if (onGround || onRope) fallingLock = false;
            if (isPressed(" ") && onGround) velocityY = 0.55;
        }

        function handleEnemyCollision() {
            for (const enemy of enemies) {
                if (enemy.trappedTimer > 0) continue;
                const hitPlayerX = Math.abs(player.position.x - enemy.mesh.position.x) < 0.9;
                const hitPlayerY = Math.abs(player.position.y - enemy.mesh.position.y) < 1.0;
                if (hitPlayerX && hitPlayerY) {
                    player.position.copyFrom(playerSpawn);
                    velocityY = 0;
                    onGround = false;
                    onLadder = false;
                    onRope = false;
                    fallingLock = false;
                    break;
                }
            }
        }

        function collectGold(goldText) {
            for (let i = golds.length - 1; i >= 0; i--) {
                const nearX = Math.abs(player.position.x - golds[i].position.x) < 0.9;
                const nearY = Math.abs(player.position.y - golds[i].position.y) < 1.0;
                if (nearX && nearY) {
                    golds[i].dispose();
                    golds.splice(i, 1);
                    goldCount++;
                    goldText.text = "Gold: " + goldCount;
                }
            }
        }

        function setEnemyController(controller) {
            enemyController = controller;
        }

        return {
            player,
            update,
            handleEnemyCollision,
            collectGold,
            setEnemyController,
        };
    }

    global.createPlayerController = createPlayerController;
})(window);
