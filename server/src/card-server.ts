import * as express from 'express';
import {createServer, Server} from 'http';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as socketIo from 'socket.io';

import * as card_data from '../../client/json-against-humanity/full.md.json';

import {Message} from './model';

interface Game {
  id: string;
  players: Player[];
  decks: string[];
  cards: any;
  blackCard: string;
  czar: string;
  state: string;
  lastAction?: any;
  owner?: string;
}

interface Player {
  id?: string;
  name?: string;
  socket?: any;
  socketId?: string;
  away?: boolean;
  score?: number;
  cards?: string[];
  czar?: boolean;
  playedCards?: string[];
}

export class CardServer {
  public static readonly PORT: number = 8080;
  private app: express.Application;
  private server: Server;
  private io: SocketIO.Server;
  private port: string|number;

  private players: {[index: string]: Player} = {};
  private games: {[index: string]: Game} = {};

  constructor() {
    this.createApp();
    this.port = process.env.PORT || CardServer.PORT;
    this.server = createServer(this.app);
    this.io = socketIo(this.server);
    setInterval(() => {
      this.cleanGames();
    }, 30000);
    this.listen();
  }

  private createApp(): void {
    this.app = express();
  }

  private listen(): void {
    this.server.listen(this.port, () => {
      console.log('Running server on port %s', this.port);
    });

    this.io.on('connect', (socket: any) => {
      console.log('Connected client on port %s.', this.port);
      socket.on('message', (m: Message) => {
        this.handleMessage(socket, m);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected');
        for (const game of Object.values(this.games)) {
          for (const player of game.players) {
            if (player.socketId == socket.id) {
              player.away = true;
              player.socketId = null;
              player.socket = null;
              break;
            }
          }
          this.broadcastGame(game);
        }
      });
    });
  }

  kickPlayer(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (!game) return;
    if (game.owner != m.player) return;
    _.remove(game.players, player => player.id == m.winner);
    this.broadcastGame(game);
  }

  createGame(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (game) {
      console.error(`Attempt to recreate game ${m.game}`);
    } else {
      game = this.newGame(m.game, m.decks);
      game.owner = m.player;
    }
    this.io.emit('message', {
      event: 'game_created',
      game: game.id,
    });
  }

  newGame(id: string, decks: string[]): Game {
    const fs = card => _.replace(card.text.replace('\\n', '<br/>'), /\*(.+?)\*/, '<em>$1</em>');
    const game = {
      id: id,
      players: [],
      decks: decks,
      cards: {
        white: [],
        black: [],
      },
      blackCard: '',
      czar: '',
      state: 'play',
      lastAction: moment(),
    };
    game.cards.black = _.shuffle(_.map(_.filter(card_data.black, c => _.includes(game.decks, c.deck)), fs));
    game.cards.white = _.shuffle(_.map(_.filter(card_data.white, c => _.includes(game.decks, c.deck)), fs));
    this.drawBlackCard(game);
    this.games[id] = game;
    console.log(`Created game "${game.id}" with ${game.cards.black.length} black cards and ${game.cards.white.length} white cards`);
    return game;
  }

  joinGame(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (!game) {
      console.log(`Invalid game ${m.game}`);
      this.io.emit('message', {
        event: 'invalid_game',
      });
      return
    }
    let player = _.find(game.players, p => p.id == m.player)
    if (!player) {
      console.log(`Player ${m.player} joined game ${game.id}`);
      player = {
        id: m.player,
        socket: socket,
        socketId: socket.id,
        name: `Player ${game.players.length + 1}`,
        away: false,
        score: 0,
        cards: [],
        czar: game.czar == m.player,
        playedCards: [],
      };
      if (this.players[player.id]) {
        player.name = this.players[player.id].name;
      }
      game.players.push(player);
      if (game.players.length == 1) {
        // First player.
        player.czar = true;
        game.czar = player.id;
      }
    }
    else {
      console.log(`Player ${m.player} rejoined game ${game.id}`);
      player.away = false;
      player.socket = socket;
      player.socketId = socket.id;
      // player.playedCards = [];
      this.broadcastGame(game);
    }
    this.broadcastGame(game);
    this.playerDrawCards(game, player);
  }

  broadcastGame(game: Game): void {
    game.lastAction = moment();
    const state = {
      id: game.id,
      owner: game.owner,
      blackCard: game.blackCard,
      czar: game.czar,
      state: game.state,
      players: _.map(game.players, player => ({
                                     id: player.id,
                                     name: player.name,
                                     away: player.away,
                                     score: player.score,
                                     czar: player.czar,
                                     cards: player.cards,
                                     playedCards: player.playedCards,
                                   })),
    };
    this.broadcast(game, {
      event: 'game_update',
      game: state,
    })
  }

  endRound(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (!game) return;
    if (game.czar != m.player) {
      console.log(`Player ${m.player} tried to end round, but czar is ${game.czar}`);
    }
    game.state = 'choose_winner';
    this.broadcastGame(game);
  }

  chooseWinner(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (!game) return;
    if (game.czar != m.player) {
      console.log(`Player ${m.player} tried to end round, but czar is ${game.czar}`);
    }
    let nextCzar = false;
    let movedCzar = false;
    for (const player of game.players) {
      for (const playedCard of player.playedCards) {
        // Remove played cards.
        _.remove(player.cards, c => c == playedCard);
      }
      player.playedCards = [];
      this.playerDrawCards(game, player);
      if (player.id == m.winner) {
        player.score++;
      }

      // Rotate the Czar.
      if (!player.away && nextCzar && !movedCzar) {
        game.czar = player.id;
        player.czar = true;
        nextCzar = false;
        movedCzar = true;
      } else if (player.czar && !movedCzar) {
        nextCzar = true;
        player.czar = false;
      }
    }
    if (nextCzar && !movedCzar) {
      game.players[0].czar = true;
      game.czar = game.players[0].id;
    }
    game.state = 'play';
    this.drawBlackCard(game);
    this.broadcastGame(game);
  }

  playCard(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (!game) return;
    for (const player of game.players) {
      if (player.id != m.player) continue;

      for (const playCard of m.cards) {
        let found = false
        for (const card of player.cards) {
          if (card == playCard) {
            found = true;
            break;
          }
        }
        if (!found) {
          console.log(`Player "${player.name}" tried to play invalid card "${playCard}"`);
          break;
        }
      }
      console.log(`Player "${player.name}" played cards ${m.cards}`);
      player.playedCards = m.cards;
    }
    this.broadcastGame(game);
  }

  setPlayerName(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (!game) return;
    for (const player of game.players) {
      if (player.id == m.player) {
        player.name = m.text;
        this.players[player.id] = {
          id: player.id,
          name: player.name,
        };
      }
    }
    this.broadcastGame(game);
  }

  handleMessage(socket: any, m: Message): void {
    switch (m.event) {
      case 'create_game':
        this.createGame(socket, m);
        break;
      case 'kick_player':
        this.kickPlayer(socket, m);
        break;
      case 'join_game':
        this.joinGame(socket, m);
        break;
      case 'play_card':
        this.playCard(socket, m);
        break;
      case 'end_round':
        this.endRound(socket, m);
        break;
      case 'set_player_name':
        this.setPlayerName(socket, m);
        break;
      case 'choose_winner':
        this.chooseWinner(socket, m);
        break;
      default:
        console.log(`Unknown message ${m.event}`);
        break;
    }
  }

  broadcast(game: Game, message: any) {
    for (const player of game.players) {
      if (player.socket) {
        try {
          player.socket.emit('message', message);
        } catch (e) {
        }
      }
    }
  }

  drawBlackCard(game: Game) {
    game.blackCard = game.cards.black.pop();
    if (!game.blackCard) {
      console.error(`No more black cards available in game ${game.id}`);
      return
    }
    this.broadcastGame(game);
  }

  playerDrawCards(game: Game, player: Player) {
    while (player.cards.length < 10) {
      const card = game.cards.white.pop();
      if (!card) {
        console.error(`No more white cards available in game ${game.id}`);
        return;
      }
      player.cards.push(card);
      try {
        player.socket.emit('message', {
          event: 'draw_card',
          card: card,
        });
      } catch (e) {
      }
    }
  }

  getApp(): express.Application {
    return this.app;
  }

  private cleanGames() {
    for (const game of Object.values(this.games)) {
      if (game.lastAction.isBefore(moment().subtract(1, 'hours'))) {
        console.log(`Expiring game ${game.id}`);
        delete this.games[game.id];
      }
    }
  }
}

