"use strict";

let ranking =[{"name":"hanSuh","time":1000}];

function mod(n, m) {
  return ((n % m) + m) % m;
}

class Cell {
  constructor(gridX, gridY) {
    // Store the position of this cell in the grid
    this.gridX = gridX;
    this.gridY = gridY;

    this.alive = Math.random() > 0.95;
  }
}

class Player {
  static width = 10;
  static height = 10;
  static gliderCoolTime = 16; // number of generations
  constructor(gridX, gridY,name) {
    this.gridX = gridX;
    this.gridY = gridY;
    this.name=name;
    this.alive = true;
    this.movingUp = false;
    this.movingDown = false;
    this.movingRight = false;
    this.movingLeft = false;
    this.pressedIYHK = false;
    this.pressedNE = false;
    this.pressedNW = false;
    this.pressedSW = false;
    this.pressedSE = false;
    this.shootNE = false; // keeps track of whether the button for shooting a glider is pressed
    this.shootNW = false;
    this.shootSW = false;
    this.shootSE = false;
    this.gliderCoolTimeLeft = 0;
  }
}

class Game {

  constructor(_io,groupName,numColumns,numRows) {

    this.numColumns = numColumns;
    this.numRows = numRows;
    
    this.mapSum = true;

    this.groupName=groupName;
    this.gametime = 0;
    this.io = _io;
    this.sockets = {};
    this.players = {};
    // this.lastUpdateTime = Date.now();
    this.shouldSendUpdate = false;

    this.gameObjects = []; // array of Cells
    this.createGrid();

    this.buffer = new ArrayBuffer(
      -Math.floor((-this.numColumns * this.numRows) / 32) * 4
    );
    this.bufferView = new Uint32Array(this.buffer);

    setInterval(this.update.bind(this), 1000 / 10);
  }

  update() {
    this.gametime++;
    // io.emit('chat message', "This is a useless message :)");
    this.checkSurrounding();
    this.playerMovement();
    this.gliderUpdate();
    this.updateCoolTime();
    this.encodeBytes();
    // this.io.emit('draw',this.gametime, this.buffer,this.getPlayerPos());
    this.io.to(this.groupName).emit("gameUpdate", {
      t: Date.now(),
      gametime: this.gametime,
      buffer: this.buffer,
      playerPos: this.getPlayerPos(),
    });
    this.checkPlayerIsAlive();
  }

  createGrid() {
    for (let y = 0; y < this.numRows; y++) {
      for (let x = 0; x < this.numColumns; x++) {
        this.gameObjects.push(new Cell(x, y));
      }
    }
  }

  isAlive(x, y) {
    return this.gameObjects[
      this.gridToIndex(mod(x, this.numColumns), mod(y, this.numRows))
    ].alive
      ? 1
      : 0;
  }

  gridToIndex(x, y) {
    return x + y * this.numColumns;
  }

  checkSurrounding() {
    // Loop over all cells
    for (let x = 0; x < this.numColumns; x++) {
      for (let y = 0; y < this.numRows; y++) {
        // Count the nearby population
        let numAlive =
          this.isAlive(x - 1, y - 1) +
          this.isAlive(x, y - 1) +
          this.isAlive(x + 1, y - 1) +
          this.isAlive(x - 1, y) +
          this.isAlive(x + 1, y) +
          this.isAlive(x - 1, y + 1) +
          this.isAlive(x, y + 1) +
          this.isAlive(x + 1, y + 1);
        let centerIndex = this.gridToIndex(x, y);

        if (numAlive == 2) {
          // Do nothing
          this.gameObjects[centerIndex].nextAlive =
            this.gameObjects[centerIndex].alive;
        } else if (numAlive == 3) {
          // Make alive
          this.gameObjects[centerIndex].nextAlive = true;
        } else {
          // Make dead
          this.gameObjects[centerIndex].nextAlive = false;
        }
      }
    }

    // Apply the new state to the cells
    for (let i = 0; i < this.gameObjects.length; i++) {
      this.gameObjects[i].alive = this.gameObjects[i].nextAlive;
    }

    if(this.groupName!="FFA"){
      this.mapSum=false;
      for (let i = 0; i < this.gameObjects.length; i++) {
        if(this.gameObjects[i].alive){
          this.mapSum=true;
          return;
        }
      }
    }
  }

  keyboardInput(id, eventcode, isPressed) {
    if (eventcode[0] == "m") {
      this.players[id][eventcode] = isPressed;
    } else {
      if (isPressed ^ this.players[id].pressedIYHK) {
        this.players[id][eventcode] = isPressed;
        this.players[id].pressedIYHK = isPressed;
      }
    }
  }

  playerMovement() {
    Object.keys(this.players).forEach((id) => {
      if (!this.players[id].alive) {
        return;
      }
      if (this.players[id].movingDown) {
        this.players[id].gridY = mod(this.players[id].gridY + 1, this.numRows);
      }
      if (this.players[id].movingUp) {
        this.players[id].gridY = mod(this.players[id].gridY - 1, this.numRows);
      }
      if (this.players[id].movingLeft) {
        this.players[id].gridX = mod(
          this.players[id].gridX - 1,
          this.numColumns
        );
      }
      if (this.players[id].movingRight) {
        this.players[id].gridX = mod(
          this.players[id].gridX + 1,
          this.numColumns
        );
      }
    });
  }

  checkPlayerIsAlive() {
    if(!this.mapSum && this.groupName in this.players){
      let i;
      for (i = 0; i < ranking.length; i++){
        if(this.gametime<ranking[i].time){break;}
      }
      ranking.splice( i, 0, {
        'name':this.players[this.groupName].name,
        'time':this.gametime
      } )
      ranking=ranking.slice(0,100);
      this.io.to(this.groupName).emit("drawScoreBoard",ranking.slice(0,15));
      this.io.to(this.groupName).emit("singleClear",i);
      delete this.players[this.groupName];
    }

    Object.keys(this.players).forEach((socketid) => {
      if (
        this.players[socketid].alive &&
        this.isAlive(this.players[socketid].gridX, this.players[socketid].gridY) === 1
      ) {
        this.io.to(socketid).emit("dead");
        delete this.players[socketid];
      }
    });
  }

  shootAGlider() {
    Object.keys(this.players).forEach((id) => {
      if (this.players[id].gliderCoolTimeLeft === 0) {
        if (this.players[id].pressedNE) {
          this.players[id].shootNE = true;
          this.players[id].gliderCoolTimeLeft = Player.gliderCoolTime;
          return;
        } else if (this.players[id].pressedNW) {
          this.players[id].shootNW = true;
          this.players[id].gliderCoolTimeLeft = Player.gliderCoolTime;
        } else if (this.players[id].pressedSW) {
          this.players[id].shootSW = true;
          this.players[id].gliderCoolTimeLeft = Player.gliderCoolTime;
        } else if (this.players[id].pressedSE) {
          this.players[id].shootSE = true;
          this.players[id].gliderCoolTimeLeft = Player.gliderCoolTime;
        }
      }
    });
  }

  gliderUpdate() {
    Object.keys(this.players).forEach((id) => {
      if (!this.players[id].alive) {
        return;
      }
      this.shootAGlider();
      if (this.players[id].shootNE) {
        this.players[id].shootNE = false;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 1, this.numColumns),
            mod(this.players[id].gridY - 2, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 2, this.numColumns),
            mod(this.players[id].gridY - 3, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 3, this.numColumns),
            mod(this.players[id].gridY - 1, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 3, this.numColumns),
            mod(this.players[id].gridY - 2, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 3, this.numColumns),
            mod(this.players[id].gridY - 3, this.numRows)
          )
        ].alive = true;
      } else if (this.players[id].shootNW) {
        this.players[id].shootNW = false;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 1, this.numColumns),
            mod(this.players[id].gridY - 3, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 2, this.numColumns),
            mod(this.players[id].gridY - 1, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 2, this.numColumns),
            mod(this.players[id].gridY - 3, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 3, this.numColumns),
            mod(this.players[id].gridY - 2, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 3, this.numColumns),
            mod(this.players[id].gridY - 3, this.numRows)
          )
        ].alive = true;
      } else if (this.players[id].shootSW) {
        this.players[id].shootSW = false;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 1, this.numColumns),
            mod(this.players[id].gridY + 2, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 2, this.numColumns),
            mod(this.players[id].gridY + 3, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 3, this.numColumns),
            mod(this.players[id].gridY + 1, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 3, this.numColumns),
            mod(this.players[id].gridY + 2, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX - 3, this.numColumns),
            mod(this.players[id].gridY + 3, this.numRows)
          )
        ].alive = true;
      } else if (this.players[id].shootSE) {
        this.players[id].shootSE = false;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 1, this.numColumns),
            mod(this.players[id].gridY + 3, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 2, this.numColumns),
            mod(this.players[id].gridY + 1, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 2, this.numColumns),
            mod(this.players[id].gridY + 3, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 3, this.numColumns),
            mod(this.players[id].gridY + 2, this.numRows)
          )
        ].alive = true;
        this.gameObjects[
          this.gridToIndex(
            mod(this.players[id].gridX + 3, this.numColumns),
            mod(this.players[id].gridY + 3, this.numRows)
          )
        ].alive = true;
      }
    });
  }
  updateCoolTime() {
    Object.keys(this.players).forEach((id) => {
      this.players[id].gliderCoolTimeLeft = Math.max(
        0,
        this.players[id].gliderCoolTimeLeft - 1
      );
    });
  }

  addPlayer(socketid,name) {
    let randCell =
      this.gameObjects[Math.floor(this.gameObjects.length * Math.random())];
    if (!randCell.alive) {
      this.players[socketid] = new Player(randCell.gridX, randCell.gridY,name);
    } else {
      this.addPlayer(socketid,name);
    }
    if(this.groupName!="FFA"){
      this.io.to(this.groupName).emit("drawScoreBoard",ranking.slice(0,5));
    }
  }

  encodeBytes() {
    //Use TypedArrays to work with byte data.
    //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
    //signed 32 bits(8bytes) integer for the viewer
    let uint32num = 0;
    for (let i = 0; i < this.gameObjects.length; i++) {
      uint32num += this.gameObjects[i].alive << i % 32;
      if (i % 32 == 31) {
        this.bufferView[i >> 5] = uint32num;
        uint32num = 0;
      }
    }
    if (this.gameObjects.length % 32 != 0) {
      this.bufferView[this.gameObjects.length >> 5] = uint32num;
    }
  }

  getPlayerPos() {
    let pos = {};
    Object.keys(this.players).forEach((key) => {
      pos[key] = {
        gridX: this.players[key].gridX,
        gridY: this.players[key].gridY,
      };
    });
    return pos;
  }
}

module.exports = Game;
