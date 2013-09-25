(function(){
/*
  Hak Pak by Adam Gray 2013.
  
  Based on the Pac-Man Dossier [http://home.comcast.net/~jpittman2/pacman/pacmandossier.html], with a few modifications:
     * A simplified aesthetic design, and no annoying sounds!
     * Ghosts' pathfinding is done for the current tile, rather than the next one.
     * When the ghosts enter frightened mode, the scatter/chase timer is not paused.
     * The frightened pathfinding PRNG doesn't get reset with the same intial seed each time.
     * Speed is controlled probabilistically.
     * Ghosts always move left when leaving the ghost-house.
     * There are no zones where ghosts are forbidden to make upward turns.
     * Pinky and Inky's targeting methods don't include the bug present in the original game.
 */

// CONSTANTS
    var LEFT  = 1,
        UP    = 2,
        RIGHT = 3,
        DOWN  = 0;
    var SCATTER    = 1,
        CHASE      = 2,
        FRIGHTENED = 4;
    var WIDTH  = 224,
        HEIGHT =  248;
        FRAME = 12;
    var TOTALDOTS = 244;

// SETUP
    var levelElem = document.getElementById("level"),
        scoreElem = document.getElementById("score"),
        livesElem = document.getElementById("lives"),
        canv = document.getElementById("pak"),
        ctx  = canv.getContext("2d"),
        maze = document.createElement('canvas'),
        mctx  = maze.getContext('2d');
    var score, level, levelTiles,
        lives, wave, mode, flash,
        totalDotsEaten, ghostsEaten,
        globalDotCounter, dotTimer,
        modeTimeout, frightTimeout;
    canv.width  = maze.width  = WIDTH;
    canv.height = maze.height = HEIGHT;
    ctx.textAlign = "center"; 
    ctx.textBaseline = "middle"; 

// CREATE MAZE
    mctx.fillStyle = '#000000';
    mctx.strokeStyle = '#000099';
    mctx.lineCap = 'square';
    mctx.lineWidth   = 2;
    mctx.fillRect(0, 0, WIDTH, HEIGHT);
    var w = (function() {
        // top-outer
        mctx.moveTo(0, 106); mctx.lineTo(42, 106); mctx.lineTo(42, 78); mctx.lineTo(2, 78);
        mctx.lineTo(2, 2); mctx.lineTo(110, 2); mctx.lineTo(110, 34); mctx.lineTo(112, 34);
        // bottom-outer
        mctx.moveTo(0, 126); mctx.lineTo(42, 126); mctx.lineTo(42, 154); mctx.lineTo(2, 154);
        mctx.lineTo(2, 198); mctx.lineTo(18, 198); mctx.lineTo(18, 202); mctx.lineTo(2, 202);
        mctx.lineTo(2, 246); mctx.lineTo(112, 246);
        // rectangles
        mctx.rect(22, 22, 20, 12); mctx.rect(62, 22, 28, 12); mctx.rect(22, 54, 20, 4);
        mctx.rect(62, 126, 4, 28); mctx.rect(62, 174, 28, 4);
        // ghost-pen
        mctx.moveTo(104, 102); mctx.lineTo(86, 102); mctx.lineTo(86, 130); mctx.lineTo(112, 130);
        // t-shapes
        t({x:64, y:104}, {x:64, y:56}, {x:88, y:80});
        t({x:24, y:176}, {x:40, y:176}, {x:40, y:200});
        t({x:88, y:224}, {x:24, y:224}, {x:64, y:200});
    });
    mctx.beginPath(); w(); mctx.stroke();
    mctx.save(); mctx.translate(WIDTH/2, HEIGHT/2);
    mctx.scale(-1, 1); mctx.translate(-WIDTH/2, -HEIGHT/2);
    mctx.beginPath(); w(); mctx.stroke();
    mctx.restore();
    // t-shapes
    function t (left, right, base) {
        var dx = left.x - right.x, dy = left.y - right.y,
            up = dy ? (dy < 0 ? {x:1, y:0} : {x:-1, y:0}) : (dx < 0 ? {x:0, y:-1} : {x:0, y:1}),
            diff = -(up.x*(base.x-left.x))-(up.y*(base.y-left.y));
        var north = function(p, n) { n=n?n:2; return {x: p.x+n*up.x, y: p.y+n*up.y} },
            east = function(p, n) { n=n?n:2; return {x: p.x-n*up.y, y: p.y+n*up.x} },
            south = function(p, n) { n=n?n:2; return {x: p.x-n*up.x, y: p.y-n*up.y} },
            west = function(p, n) { n=n?n:2; return {x: p.x+n*up.y, y:p.y-n*up.x} },
            lineToPoint = function(p) { mctx.lineTo(p.x, p.y) };
        point = north(west(left)); mctx.moveTo(point.x, point.y);
        lineToPoint(north(east(right))); lineToPoint(south(east(right)));
        point = south(east(base)); lineToPoint(north(point, diff)); lineToPoint(point);
        point = south(west(base)); lineToPoint(point); lineToPoint(north(point, diff));
        lineToPoint(south(west(left))); lineToPoint(north(west(left)));
    }
    mctx.beginPath();
    t({x:88, y:56}, {x:136, y:56}, {x:112, y:80});
    t({x:88, y:152}, {x:136, y:152}, {x:112, y:176});
    t({x:88, y:200}, {x:136, y:200}, {x:112, y:224});
    mctx.stroke();
    // door to ghost-pen
    mctx.strokeStyle = '#996666'; mctx.beginPath();
    mctx.moveTo(104, 102); mctx.lineTo(120, 102);
    mctx.stroke();

// KEY CONTROLS
    var joystick = null;
    window.onkeydown = (function(e){
        if (!e) var e = window.event;
        var key = e.which || e.keyCode;
        if ((key >= 37 && key <= 40)) joystick = key % 4;
        return false;
    });
    window.onkeyup = (function(e){
        joystick = null;
        return false;
    });

// GAME SPECS
    var tiles = [ // >=1: legal tile, 2: dot, 3: energiser, 4: fruit
        [ , , , , , , , , , , , , , , , , , , , , , , , , , , , ],
        [ ,2,2,2,2,2,2,2,2,2,2,2,2, , ,2,2,2,2,2,2,2,2,2,2,2,2, ],
        [ ,2, , , , ,2, , , , , ,2, , ,2, , , , , ,2, , , , ,2, ],
        [ ,3, , , , ,2, , , , , ,2, , ,2, , , , , ,2, , , , ,3, ],
        [ ,2, , , , ,2, , , , , ,2, , ,2, , , , , ,2, , , , ,2, ],
        [ ,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2, ],
        [ ,2, , , , ,2, , ,2, , , , , , , , ,2, , ,2, , , , ,2, ],
        [ ,2, , , , ,2, , ,2, , , , , , , , ,2, , ,2, , , , ,2, ],
        [ ,2,2,2,2,2,2, , ,2,2,2,2, , ,2,2,2,2, , ,2,2,2,2,2,2, ],
        [ , , , , , ,2, , , , , ,1, , ,1, , , , , ,2, , , , , , ],
        [ , , , , , ,2, , , , , ,1, , ,1, , , , , ,2, , , , , , ],
        [ , , , , , ,2, , ,1,1,1,1,1,1,1,1,1,1, , ,2, , , , , , ],
        [ , , , , , ,2, , ,1, , , , , , , , ,1, , ,2, , , , , , ],
        [ , , , , , ,2, , ,1, , , , , , , , ,1, , ,2, , , , , , ],
        [1,1,1,1,1,1,2,1,1,1, , , , , , , , ,1,1,1,2,1,1,1,1,1,1],
        [ , , , , , ,2, , ,1, , , , , , , , ,1, , ,2, , , , , , ],
        [ , , , , , ,2, , ,1, , , , , , , , ,1, , ,2, , , , , , ],
        [ , , , , , ,2, , ,1,1,1,1,1,1,1,1,1,1, , ,2, , , , , , ],
        [ , , , , , ,2, , ,1, , , , , , , , ,1, , ,2, , , , , , ],
        [ , , , , , ,2, , ,1, , , , , , , , ,1, , ,2, , , , , , ],
        [ ,2,2,2,2,2,2,2,2,2,2,2,2, , ,2,2,2,2,2,2,2,2,2,2,2,2, ],
        [ ,2, , , , ,2, , , , , ,2, , ,2, , , , , ,2, , , , ,2, ],
        [ ,2, , , , ,2, , , , , ,2, , ,2, , , , , ,2, , , , ,2, ],
        [ ,3,2,2, , ,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2, , ,2,2,3, ],
        [ , , ,2, , ,2, , ,2, , , , , , , , ,2, , ,2, , ,2, , , ],
        [ , , ,2, , ,2, , ,2, , , , , , , , ,2, , ,2, , ,2, , , ],
        [ ,2,2,2,2,2,2, , ,2,2,2,2, , ,2,2,2,2, , ,2,2,2,2,2,2, ],
        [ ,2, , , , , , , , , , ,2, , ,2, , , , , , , , , , ,2, ],
        [ ,2, , , , , , , , , , ,2, , ,2, , , , , , , , , , ,2, ],
        [ ,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2, ],
        [ , , , , , , , , , , , , , , , , , , , , , , , , , , , ]
    ],
    ghostTarget = {r: 11, c: 13},
    fruit = [0,100,300,500,500,700,700,1000,1000,2000,2000,3000,3000,5000], // fruit points (per level)
    frightTime = [0,6,5,4,3,2,5,2,2,1,5,2,1,1,3,1,1,0], // fright time in seconds (per level)
    dotTimerLimit = [0,4,4,4,4,3],
    elroy1 = [0,20,30,40,40,40,50,50,50,60,60,60,80,80,80,100,100,100,100,120], // cruise elroy 1 dots left (per level)
    elroy2 = [0,10,15,20,20,20,25,25,25,30,30,30,40,40,40,50,50,50,50,60], // cruise elroy 2 dots left (per level)
    speed = function(a) { // speed of actors in various situations
        var actor = actors[a], p = actor.position,
            s = levelValue([0,70,80,80,80,90]),
            e1 = levelValue(elroy1), e2 = levelValue(elroy2);
        
        if (a == "Pak")                                return s + (level < 21 ? 5 : -5); // pak
        else { // ghost
            if (p.y == 116 && (p.x < 48 || p.x > 176)) return s * 0.55; // tunnel
            else if (actor.frightened)                 return s * 0.65; // frightened
            else if ((a == "Blinky") && (globalDotCounter == null || globalDotCounter > 32) &&
                (TOTALDOTS - totalDotsEaten <= e2))    return s * 1.10; // elroy 2
            else if ((a == "Blinky") && (globalDotCounter == null || globalDotCounter > 32) &&
                (TOTALDOTS - totalDotsEaten <= e1))    return s * 1.05; // elroy 1
            else                                       return s;        // ghost (normal)
        }
    },
    modeTime = [[],[],[],[],[]]; // modeTime[wave][mode][level] = time (in seconds)
        modeTime[1][SCATTER] = [0,7,7,7,7,5];
        modeTime[1][CHASE]   = [0,20];
        modeTime[2][SCATTER] = [0,7,7,7,7,5];
        modeTime[2][CHASE]   = [0,20];
        modeTime[3][SCATTER] = [0,5];
        modeTime[3][CHASE]   = [0,20,1035];
        modeTime[4][SCATTER] = [0,5,0];
        modeTime[4][CHASE]   = [0,Infinity];

// ACTORS
    var actors = {
        Pak: {
            start: {x: 116, y: 188},
            color: 'yellow'
        },
        Blinky: {
            start: tilePos(ghostTarget),
            color: 'rgba(255,0,0,0.8)',
            target: function() {
                if ((mode == SCATTER) && ((TOTALDOTS - totalDotsEaten > levelValue(elroy1)) || 
                                          (globalDotCounter != null && globalDotCounter <= 32))) {
                    return {r: -1, c: 27};
                }
                else return actorInfo('Pak').tile;
            }
        },
        Pinky: {
            start: {x: 112, y: 116},
            color: 'rgba(255,100,150,0.8)',
            dotLimit: [0],
            globalDotLimit: 7,
            target: function() {
                if (mode == SCATTER) return {r: -1, c: 0};
                else {
                    var pak = actorInfo('Pak');
                    return nInDirection(pak.tile, 4, pak.direction);
                }
            }
        },
        Inky: {
            start: {x: 96, y: 116},
            color: 'rgba(50,150,255,0.8)',
            dotLimit: [0,30,0],
            globalDotLimit: 17,
            target: function() {
                if (mode == SCATTER) return {r: 31, c: 27};
                else {
                    var pak    = actorInfo('Pak'),
                        bt     = actorInfo('Blinky').tile,
                        offset = nInDirection(pak.tile, 2, pak.direction),
                        dr     = offset.r - bt.r,
                        dc     = offset.c - bt.c;
                    return {r: bt.r + 2*dr, c: bt.c + 2*dc};
                }
            }
        },
        Clyde: {
            start: {x: 128, y: 116},
            color: 'rgba(255,150,0,0.8)',
            dotLimit: [0,60,50,0],
            target: function() {
                var pak   = actorInfo('Pak'),
                    clyde = actorInfo('Clyde');
                if ((mode == SCATTER) || (distance(pak.tile, clyde.tile) < 8)) return {r: 31, c: 0};
                else return pak.tile;
            }
        },
    };

// START THE GAME
    ctx.drawImage(maze, 0, 0);
    ctx.fillStyle = "#FF0000";
    ctx.font = "32px Palatino";
    ctx.fillText("Hak Pak", WIDTH/2, 92);
    ctx.font = "10px Palatino";
    ctx.fillText("[click to begin]", WIDTH/2, 116);
    ctx.fillText("(hold arrow keys to turn)", WIDTH/2, 188);
    canv.onclick = function() {
        canv.onclick = null;
        canv.oncontextmenu = null;
        startGame();
    };
    canv.oncontextmenu = function() {
        var c = [3,2,3,6,3,9,3,10,3,11,3,14,3,15,3,16,3,17,3,20,3,21,3,22,3,23,3,24,4,2,4,3,4,5,4,6,4,8,4,12,4,14,4,18,4,20,5,2,5,4,5,6,5,8,5,9,5,10,5,11,5,12,5,14,5,18,5,20,5,21,5,22,5,23,5,24,6,2,6,6,6,8,6,12,6,14,6,18,6,20,7,2,7,6,7,8,7,12,7,14,7,15,7,16,7,17,7,20,7,21,7,22,7,23,7,24,9,8,9,9,9,10,9,11,9,14,9,18,10,8,10,12,10,15,10,17,11,8,11,9,11,10,11,11,11,16,12,8,12,12,12,16,13,8,13,9,13,10,13,11,13,16,16,3,16,4,16,5,16,8,16,9,16,10,16,11,16,15,16,16,16,17,16,20,16,24,17,2,17,6,17,8,17,12,17,14,17,18,17,20,17,21,17,23,17,24,18,2,18,3,18,4,18,5,18,6,18,8,18,12,18,14,18,15,18,16,18,17,18,18,18,20,18,22,18,24,19,2,19,6,19,8,19,12,19,14,19,18,19,20,19,24,20,2,20,6,20,8,20,9,20,10,20,11,20,14,20,18,20,20,20,24,22,3,22,4,22,5,22,6,22,8,22,9,22,10,22,11,22,15,22,16,22,17,22,20,22,24,23,2,23,8,23,12,23,14,23,18,23,21,23,23,24,2,24,4,24,5,24,6,24,8,24,10,24,11,24,14,24,15,24,16,24,17,24,18,24,22,25,2,25,6,25,8,25,11,25,14,25,18,25,22,26,3,26,4,26,5,26,6,26,8,26,12,26,14,26,18,26,22];
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, WIDTH, HEIGHT); var grd=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
        grd.addColorStop(0,"green"); grd.addColorStop(1,"blue"); ctx.fillStyle = grd;
        for (var i = 0; i < c.length; i+=2) ctx.fillRect(8*c[i+1], 8*c[i], 7, 7);
        ctx.beginPath(); ctx.fillStyle = "yellow"; ctx.arc(36, 94, 16, 2.4*Math.PI/2, 1.6*Math.PI/2); ctx.lineTo(36, 94); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = "red"; ctx.arc(180, 94, 16, 0.7*Math.PI, 0.3*Math.PI); ctx.fill();
        return false;
    }


// GAME MANAGEMENT
    // start game
    function startGame() {
        score = 0; level = 0; lives = 0;
        nextLevel();
    }
    // next level
    function nextLevel() {
        level++; levelTiles = arrayClone(tiles); lives += 3;
        totalDotsEaten = 0; ghostsEaten = {now: 0, level: 0};
        for (var a in actors) {
            var actor = actors[a];
            if (actor.dotLimit) actor.dotCounter = 0;
        }
        restartLevel();
        globalDotCounter = null;
    }
    // restart level
    function restartLevel() {
        // starting places
        for (var a in actors) {
            var actor = actors[a];
            actor.position = actor.start;
            actor.direction = (actor.start.x >= 108) ? LEFT : RIGHT;
            if (actor.dotLimit) {
                actor.home = actor.homeBound = true;
            }
            else actor.home = false;
            actor.frightened = actor.dead = false;
        }
        // initial mode
        clearTimeout(modeTimeout);
        wave = 1;
        mode = SCATTER;
        
        // global dot tracking
        globalDotCounter = 0;
        dotTimer = 0;
         
        // start
        display();
        setTimeout(function(){
            schedule();
            step();
        }, 2000);
    }
    // schedule next mode / wave
    function schedule() {
        var t = levelValue(modeTime[wave][mode]);
        if (t < Infinity) {
            modeTimeout = setTimeout(function(){
                // change mode (and wave if appropriate)
                mode = (2*mode)%3;
                if (mode == SCATTER) wave++;
                // reverse direction of ghosts
                for (var a in actors) {
                    var actor = actors[a];
                    if (a != 'Pak' && !actor.dead && !actor.home) actor.direction = behind(actor.direction);
                }
                // schedule next mode
                schedule();
            }, 1000*t);
        }
    }
    // a step in time
    function step() {
        var counters = ["Pinky", "Inky", "Clyde"]; // actors with dot counter (in preferred order)
        dotTimer += FRAME/1000;
        
        for (var a in actors) {
            var actor = actors[a],
                dir = actor.direction,
                pos = actor.position,
                tile = posTile(actor.position),
                moved = false;
                            
            // move
            if (actor.lag) actor.lag--; // lag
            else if (100*Math.random() < speed(a)) { // throttle speed
                moved = true;
                if (!isCenter(pos) || actor.home || legalTile(nInDirection(tile, 1, dir))) {
                    // move actor in actor's direction
                    pos = nInDirection(pos, 1, dir);
                    // shift towards midline of tile
                    pos = {x: pos.x - sign((dir%2^1) * (pos.x%8 - 4)),
                           y: pos.y - sign((dir%2)   * (pos.y%8 - 4))};
                    // update position
                    tile = posTile(actor.position = pos);
                }
            }
            
            // pak's response to new situation
            if (a == 'Pak') {
                if ((joystick != null) && legalTile(nInDirection(tile, 1, joystick))) {
                    actor.direction = joystick;
                }
                // dots etc
                if (levelTiles[tile.r][tile.c] > 1) {
                    var x = levelTiles[tile.r][tile.c];
                    if (x == 2 || x == 3) {
                        dotTimer = 0;
                        totalDotsEaten++;
                        if (globalDotCounter != null) globalDotCounter++;
                        else {
                            for (var c = 0; c < 3; c++) {
                                var counter = actors[counters[c]];
                                if (counter.home) {
                                    counter.dotCounter++;
                                    break;
                                }
                            }
                        }
                    }
                    if (x == 3) { // energiser
                        actor.lag = 3;
                        score += 50;
                        ghostsEaten.now = 0;
                        frighten();
                    }
                    else if (x == 4) score += levelValue(fruit); // fruit
                    else { // dot
                        actor.lag = 1;
                        score += 10;
                    }
                    levelTiles[tile.r][tile.c] = 1;
                }
            }
            // ghosts' response to new situation
            else {
                // leaving home
                if (globalDotCounter != null) {
                    if (globalDotCounter == actor.globalDotLimit) actor.homeBound = false;
                }
                else if (actor.dotLimit && (actor.dotCounter >= levelValue(actor.dotLimit))) {
                    actor.homeBound = false;
                }
                // returning home
                if (actor.dead && distance(tile, ghostTarget) == 0) actor.home = actor.homeBound = true;
                // collision with pak
                if (distance(tile, posTile(actors.Pak.position)) == 0) {
                    if (actor.frightened) { // pak eats ghost
                        score += 200 * ++ghostsEaten.now;
                        if (++ghostsEaten.level == 16) score += 12000;
                        actor.frightened = false;
                        actor.dead = true;
                    }
                    else if (!actor.dead) { // pak loses a life
                        lives --;
                        if (lives) restartLevel();
                        else gameOver();
                        return;
                    }
                }
                // pathfinding
                if (moved && isCenter(pos)) {
                    if (actor.home) {
                        if (distance(tile, ghostTarget) == 0) {
                            if (dir == UP) {
                                actor.direction = LEFT;
                                actor.home = false;
                            }
                            else actor.direction = DOWN;
                        }
                        else if (pos.y == 116) {
                            if (pos.x == 108) {
                                actor.dead = false;
                                if (a != "Blinky" && (dir == DOWN || actor.homeBound)) {
                                    actor.direction = (actor.start.x > 108) ? RIGHT : LEFT;
                                }
                                else actor.direction = UP;
                            }
                            else if (pos.x - actor.start.x < 8) actor.direction = (actor.start.x > 109) ? LEFT : RIGHT;
                        }
                    }
                    else if (actor.frightened) {
                        for (var d = Math.floor(4*Math.random()); ; d=(d+1)%4) { // random direction, check clockwise
                            if ((d != behind(dir)) && legalTile(nInDirection(tile, 1, d))) { // not behind, and legal
                                actor.direction = d;
                                break;
                            }
                        }
                    }
                    else {
                        var testTiles = [],
                            minDistance = Infinity,
                            target = actor.dead ? ghostTarget : actor.target();
                        for (var i = 3; i < 7; i++) {
                            var d = i % 4, // right, down, left, up
                                test = nInDirection(tile, 1, d);
                            if ((d != behind(dir)) && legalTile(test)) { // not behind, and legal
                                test.direction = d;
                                test.distance = distance(test, target);
                                if (test.distance <= minDistance) {
                                    minDistance = test.distance;
                                    testTiles.unshift(test);
                                }
                            }
                        }
                        actor.direction = testTiles[0].direction; // preferred shortest distance
                    }
                }
            }
        }
        
        // global dot counting / timing
        if (actors.Clyde.home && globalDotCounter == 32) globalDotCounter = null;
        if (dotTimer >= levelValue(dotTimerLimit)) {
            dotTimer = 0;
            for (var c = 0; c < 3; c++) {
                var counter = actors[counters[c]];
                if (counter.home) {
                    counter.homeBound = false;
                    break;
                }
            }
        }
        
        // fruit
        if (totalDotsEaten == 70 || totalDotsEaten == 170) {
            levelTiles[17][13] = 4;
            setTimeout(function(){
                levelTiles[17][13] = 1;
            }, 1000*(9+Math.random()));
        }
        
        // update display
        display();
        
        // level end
        if (totalDotsEaten == TOTALDOTS) {
            nextLevel();
            return;
        }
        
        // next step
        setTimeout(step, FRAME);
    }
    // frighten the ghosts
    function frighten() {
        clearTimeout(frightTimeout);
        var t = 1000*levelValue(frightTime);
        for (var a in actors) {
            var actor = actors[a];
            if (a != 'Pak' && !actor.dead) {
                if (!actor.home) actor.direction = behind(actor.direction);
                actor.frightened = true;
            }
        }
        frightTimeout = setTimeout(function(){
            flash = true;
            setTimeout(function(){ flash = false }, 200);
            frightTimeout = setTimeout(function(){
                for (var a in actors) {
                    actors[a].frightened = false;
                }
            }, 500);
        }, t-500);
    }
    // game over
    function gameOver() {
        display();
        ctx.fillStyle = "#FF0000";
        ctx.font = "32px Palatino";
        ctx.fillText("Game Over!", WIDTH/2, 92);
        ctx.font = "10px Palatino";
        ctx.fillText("[click to play again]", WIDTH/2, 116);
        canv.onclick = function() {
            startGame();
            canv.onclick = null;
        };
    }


// DRAW MAZE
    function display() {
        // dashboard
        levelElem.innerHTML = level;
        scoreElem.innerHTML = score;
        livesElem.innerHTML = lives;
        // background & walls
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(maze, 0, 0);
        // dots
        for (var r = 0; r < 31; r++) {
            for (var c = 0; c < 28; c++) {
                var x = 8*c, y = 8*r;
                ctx.fillStyle = '#FFCC99';
                if (levelTiles[r][c] == 2) ctx.fillRect(x+3, y+3, 2, 2); // dot
                if (levelTiles[r][c] == 3) ctx.fillRect(x+2, y+2, 4, 4); // energiser
                if (levelTiles[r][c] == 4) { // fruit
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.strokeStyle = '#00FF00';
                    ctx.moveTo(x+4, y+4); ctx.lineTo(x+6, y); ctx.lineTo(x+6, y+5); ctx.stroke();
                    ctx.fillStyle = '#FF3300'; ctx.beginPath(); ctx.arc(x+4, y+4, 2, 0, 2*Math.PI); ctx.fill();
                    ctx.fillStyle = '#FF3300'; ctx.beginPath(); ctx.arc(x+6, y+5, 2, 0, 2*Math.PI); ctx.fill();
                }
            }
        }
        // actors
        for (var a in actors) {
            var actor = actors[a];
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = actor.color;
            if (a == "Pak") {
                ctx.arc(actor.position.x, actor.position.y, 7, (actor.direction + 1.4)*Math.PI/2, (actor.direction + 0.6)*Math.PI/2);
                ctx.lineTo(actor.position.x, actor.position.y);
            }
            else {
                if (actor.frightened) {
                    if (flash) ctx.fillStyle = 'rgba(200,200,255,0.8)';
                    else ctx.fillStyle = 'rgba(0,0,200,0.8)';
                }
                else if (actor.dead) {
                    ctx.globalAlpha = 0.3;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = 'white';
                }
                ctx.arc(actor.position.x, actor.position.y, (actor.dead ? 5 : 7), 0.7*Math.PI, 0.3*Math.PI);
            }
            ctx.fill();
            ctx.restore();
        }
    }



// SUPPORT FUNCTIONS
    // position of tile
    function tilePos(tile) {
        return {x: 8*tile.c+4, y: 8*tile.r+4};
    }
    // tile of position
    function posTile(pos) {
        return {r: Math.floor(pos.y/8), c: Math.floor(pos.x/8)};
    }
    // check if position is center of tile
    function isCenter(pos) {
        var tile = posTile(pos),
            center = tilePos(tile);
        return (pos.x == center.x && pos.y == center.y);
    }
    // calculate distance between tiles
    function distance(t1, t2) {
        return Math.sqrt(Math.pow(Math.abs(t1.r - t2.r), 2) + Math.pow(Math.abs(t1.c - t2.c), 2));
    }
    // check if tile is legal
    function legalTile(tile) {
        return tiles[tile.r][tile.c];
    }
    // return a position/tile n units in given direction
    function nInDirection(z, n, d) {
        var result = {}, el, wrap;
        for (el in z) {
            // move in direction
            if (el == 'c' || el == 'x') result[el] = z[el] + (d&1 ? n*(d-2) : 0);
            else if (el == 'r' || el == 'y') result[el] = z[el] + (d&1 ? 0 : n*(1-d));
        }
        // wrapping through tunnel:
        if (result.y == 116) {
            if (result.x < 0 || result.x >= WIDTH) result.x = (WIDTH + result.x) % WIDTH;
        }
        else if (result.r == 14) {
            if (result.c < 0 || result.c >= WIDTH/8) result.c = (WIDTH/8 + result.c) % (WIDTH/8);
        }
        
        return result;
    }
    // return reverse direction
    function behind(d) {
        return (d+2)%4;
    }
    // get actor info
    function actorInfo(a) {
        var actor = actors[a];
        return {tile: posTile(actor.position), direction: actor.direction};
    }
    // get level value
    function levelValue(a) {
        return a[level] || a[a.length-1];
    }
    // deep clone an array
    function arrayClone(a) {
        var result = [];
        for (var i = 0; i < a.length; i++) {
            var elem = a[i];
            result.push((Array.isArray(elem)) ? arrayClone(elem) : elem);
        }
        return result;
    }
    // get the sign of a number
    function sign(x) {
        return x ? x < 0 ? -1 : 1 : 0;
    }

})();
