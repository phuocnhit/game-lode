(function (global) {
    function createMenuScene(config) {
        const {
            engine,
            levelMaps,
            getHighestUnlockedIndex,
            getLastPlayedLevel,
            onStartGame,
        } = config;

        const menuScene = new BABYLON.Scene(engine);
        menuScene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.11, 1);

        const menuCamera = new BABYLON.FreeCamera("menuCam", new BABYLON.Vector3(0, 0, -10), menuScene);
        menuCamera.setTarget(BABYLON.Vector3.Zero());
        menuCamera.inputs.clear();

        let menuBackgroundLayer = null;
        try {
            menuBackgroundLayer = new BABYLON.Layer("menuBgLayer", "menu-background.png", menuScene, true);
        } catch (err) {
            console.warn("Cannot create menu background layer with menu-background.png", err);
        }
        if (!menuBackgroundLayer) {
            try {
                menuBackgroundLayer = new BABYLON.Layer("menuBgLayerFallback", "background-lode.png", menuScene, true);
            } catch (err) {
                console.warn("Cannot create fallback menu background layer", err);
            }
        }
        if (menuBackgroundLayer) {
            menuBackgroundLayer.isBackground = true;
            menuBackgroundLayer.alpha = 1;
        }

        const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("MenuUI", true, menuScene);

        const vignette = new BABYLON.GUI.Rectangle("vignette");
        vignette.thickness = 0;
        vignette.background = "#050810";
        vignette.alpha = 0.12;
        ui.addControl(vignette);

        const root = new BABYLON.GUI.StackPanel("menuRoot");
        root.width = "900px";
        root.isVertical = true;
        root.spacing = 10;
        root.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        root.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        ui.addControl(root);

        let highestUnlocked = Math.max(0, Math.min(levelMaps.length - 1, getHighestUnlockedIndex()));
        let selectedLevel = Math.max(0, Math.min(highestUnlocked, getLastPlayedLevel()));

        const startButton = BABYLON.GUI.Button.CreateSimpleButton("start", "START GAME");
        startButton.width = "310px";
        startButton.height = "74px";
        startButton.color = "#42280f";
        startButton.background = "#f0c065";
        startButton.cornerRadius = 34;
        startButton.thickness = 4;
        startButton.fontSize = 42;
        startButton.fontWeight = "900";
        startButton.onPointerUpObservable.add(() => {
            if (selectedLevel > highestUnlocked) return;
            onStartGame(selectedLevel);
        });
        root.addControl(startButton);

        const levelsContainer = new BABYLON.GUI.StackPanel("levelsContainer");
        levelsContainer.width = "860px";
        levelsContainer.height = "260px";
        levelsContainer.isVertical = true;
        levelsContainer.spacing = 14;
        root.addControl(levelsContainer);

        const topRow = new BABYLON.GUI.StackPanel("topRow");
        topRow.isVertical = false;
        topRow.height = "94px";
        topRow.spacing = 16;
        topRow.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelsContainer.addControl(topRow);

        const bottomRow = new BABYLON.GUI.StackPanel("bottomRow");
        bottomRow.isVertical = false;
        bottomRow.height = "94px";
        bottomRow.spacing = 16;
        bottomRow.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelsContainer.addControl(bottomRow);

        const pagerRow = new BABYLON.GUI.StackPanel("pagerRow");
        pagerRow.isVertical = false;
        pagerRow.height = "44px";
        pagerRow.spacing = 14;
        pagerRow.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelsContainer.addControl(pagerRow);

        const pageSize = 10;
        let pageIndex = 0;
        const levelButtons = [];

        function styleLevelButton(button, isSelected, isUnlocked) {
            if (!isUnlocked) {
                button.background = "#8a7f6c";
                button.alpha = 0.45;
                button.color = "#d8d0c2";
                button.thickness = 1;
                button.fontWeight = "700";
                return;
            }

            if (isSelected) {
                button.background = "#f0ca79";
                button.alpha = 1;
                button.color = "#3e2712";
                button.thickness = 3;
                button.fontWeight = "900";
            } else {
                button.background = "#dec9a7";
                button.alpha = 0.92;
                button.color = "#5a3c24";
                button.thickness = 2;
                button.fontWeight = "700";
            }
        }

        for (let i = 0; i < pageSize; i++) {
            const slot = BABYLON.GUI.Button.CreateSimpleButton(`levelBtn${i}`, `${i + 1}`);
            slot.width = "150px";
            slot.height = "62px";
            slot.cornerRadius = 30;
            slot.color = "#5a3c24";
            slot.background = "#dec9a7";
            slot.alpha = 0.92;
            slot.fontSize = 36;
            slot.thickness = 2;
            slot.onPointerUpObservable.add(() => {
                const level = slot.metadata && typeof slot.metadata.levelIndex === "number"
                    ? slot.metadata.levelIndex
                    : null;
                if (level === null) return;
                selectedLevel = level;
                renderLevelButtons();
            });

            levelButtons.push(slot);
            if (i < 5) {
                topRow.addControl(slot);
            } else {
                bottomRow.addControl(slot);
            }
        }

        const prevPage = BABYLON.GUI.Button.CreateSimpleButton("prevPage", "<");
        prevPage.width = "72px";
        prevPage.height = "38px";
        prevPage.cornerRadius = 16;
        prevPage.color = "#2f1c0d";
        prevPage.background = "#e7be76";
        prevPage.alpha = 0.95;
        prevPage.fontSize = 26;
        prevPage.onPointerUpObservable.add(() => {
            const pageCount = Math.max(1, Math.ceil(levelMaps.length / pageSize));
            pageIndex = (pageIndex - 1 + pageCount) % pageCount;
            selectedLevel = Math.min(highestUnlocked, pageIndex * pageSize);
            renderLevelButtons();
        });
        pagerRow.addControl(prevPage);

        const pageText = new BABYLON.GUI.TextBlock("pageText", "Page 1/1");
        pageText.width = "220px";
        pageText.height = "38px";
        pageText.color = "#dfc9a0";
        pageText.fontSize = 24;
        pagerRow.addControl(pageText);

        const nextPage = BABYLON.GUI.Button.CreateSimpleButton("nextPage", ">");
        nextPage.width = "72px";
        nextPage.height = "38px";
        nextPage.cornerRadius = 16;
        nextPage.color = "#2f1c0d";
        nextPage.background = "#e7be76";
        nextPage.alpha = 0.95;
        nextPage.fontSize = 26;
        nextPage.onPointerUpObservable.add(() => {
            const pageCount = Math.max(1, Math.ceil(levelMaps.length / pageSize));
            pageIndex = (pageIndex + 1) % pageCount;
            selectedLevel = Math.min(highestUnlocked, pageIndex * pageSize);
            renderLevelButtons();
        });
        pagerRow.addControl(nextPage);

        const helpText = new BABYLON.GUI.TextBlock("helpText", "Arrows: move | A/B: dig | F2: inspector");
        helpText.height = "32px";
        helpText.color = "#d2def3";
        helpText.fontSize = 22;
        root.addControl(helpText);

        function renderLevelButtons() {
            highestUnlocked = Math.max(0, Math.min(levelMaps.length - 1, getHighestUnlockedIndex()));
            selectedLevel = Math.max(0, Math.min(selectedLevel, highestUnlocked));

            const pageCount = Math.max(1, Math.ceil(levelMaps.length / pageSize));
            pageIndex = Math.max(0, Math.min(pageCount - 1, Math.floor(selectedLevel / pageSize)));
            pageText.text = `Page ${pageIndex + 1}/${pageCount}`;

            for (let i = 0; i < pageSize; i++) {
                const levelIndex = pageIndex * pageSize + i;
                const button = levelButtons[i];
                const isActive = levelIndex < levelMaps.length;
                button.isVisible = isActive;
                if (!isActive) continue;

                const isUnlocked = levelIndex <= highestUnlocked;

                button.metadata = { levelIndex };
                button.textBlock.text = `${levelIndex + 1}`;
                button.isEnabled = isUnlocked;
                styleLevelButton(button, levelIndex === selectedLevel, isUnlocked);
            }

            startButton.isEnabled = selectedLevel <= highestUnlocked;
            startButton.alpha = startButton.isEnabled ? 1 : 0.5;
        }

        renderLevelButtons();
        return menuScene;
    }

    global.createMenuScene = createMenuScene;
})(window);
