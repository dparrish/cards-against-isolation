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
  vote?: any;
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

  kickPlayer(game: Game, id: string): void {
    if (game.czar == id) {
      this.nextCzar(game);
    }
    _.remove(game.players, player => player.id == id);
    this.broadcastGame(game);
  }

  createGame(game: Game, m: Message): void {
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

  nextCzar(game: Game) {
    let nextCzar = false;
    let movedCzar = false;
    for (const player of game.players) {
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
  }

  joinGame(game: Game, socket: any, m: Message): void {
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

  endRound(game: Game, m: Message): void {
    if (game.czar != m.player) {
      console.log(`Player ${m.player} tried to end round, but czar is ${game.czar}`);
    }
    game.state = 'choose_winner';
    this.broadcastGame(game);
  }

  chooseWinner(game: Game, m: Message): void {
    if (game.czar != m.player) {
      console.log(`Player ${m.player} tried to end round, but czar is ${game.czar}`);
    }
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
    }
    this.nextCzar(game);
    game.state = 'play';
    this.drawBlackCard(game);
    this.broadcastGame(game);
  }

  playCard(game: Game, m: Message): void {
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

  setPlayerName(game: Game, m: Message): void {
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

  availablePlayers(game: Game): number {
    return _.filter(game.players, p => !p.away).length;
  }

  startVote(game: Game, m: Message): void {
    game.vote = {
      title: m.text,
      timeout: m.args.timeout || 30,
      votes: {},
      required: Math.ceil(this.availablePlayers(game) / 2),
      args: m.args,
    };
    for (const player of game.players) {
      game.vote.votes[player.id] = 'unknown';
    }
    game.vote.votes[m.player] = 'yes';
    this.broadcast(game, {
      event: 'vote_start',
      args: game.vote,
    })
    game.vote.timer = setTimeout(() => {
      if (!game.vote) return;
      console.log(`Timed out vote ${game.vote.title}`);
      this.broadcast(game, {
        event: 'vote_failed',
        text: 'Vote expired',
      })
      game.vote = null;
    }, game.vote.timeout * 1000);
    console.log(`Start vote "${game.vote.title} - ${game.vote.required} votes required to pass`);
  }

  vote(game: Game, m: Message): void {
    if (!game.vote) {
      return;
    }
    game.vote.votes[m.player] = m.text;
    this.broadcast(game, {
      event: 'vote_update',
      args: game.vote,
    })
    // See if there is a resolution.
    console.log(`Got a vote "${m.text}" for "${game.vote.title}"`);
    const required = Math.ceil(this.availablePlayers(game) / 2);
    console.log(`  required ${required} to resolve`);
    const results = _.uniq(Object.values(game.vote.votes));
    for (const result of results) {
      if (result == 'unknown') {
        continue;
      }
      const count = _.filter(Object.values(game.vote.votes), r => r == result).length;
      console.log(`  ${result} has ${count} votes`);
      if (count < required) {
        continue;
      }
      console.log(`Vote "${game.vote.title}" has finished with result "${result}"`)
      if (result == 'yes') {
        if (game.vote.args.type == 'kick-player') {
          this.kickPlayer(game, game.vote.args.player);
        } else if (game.vote.args.type == 'skip-card') {
          for (const player of game.players) {
            player.playedCards = [];
          }
          game.state = 'play';
          this.drawBlackCard(game);
          this.broadcastGame(game);
        }
        this.broadcast(game, {
          event: 'vote_passed',
          text: 'Vote passed',
        })
      }
      else {
        this.broadcast(game, {
          event: 'vote_failed',
          text: 'Vote failed',
        })
      }
      return;
    }
  }

  handleMessage(socket: any, m: Message): void {
    let game = this.games[m.game];
    if (m.event == 'create_game') {
      this.createGame(game, m);
      return;
    }

    if (!game) {
      console.log(` Invalid game ${m.game}`);
      socket.emit('message', {
        event: 'invalid_game',
      });
      return
    }
    if (m.event == 'join_game') {
      this.joinGame(game, socket, m);
      return;
    }
    switch (m.event) {
      case 'play_card':
        this.playCard(game, m);
        break;
      case 'end_round':
        this.endRound(game, m);
        break;
      case 'set_player_name':
        this.setPlayerName(game, m);
        break;
      case 'choose_winner':
        this.chooseWinner(game, m);
        break;
      case 'start_vote':
        this.startVote(game, m);
        break;
      case 'vote':
        this.vote(game, m);
        break;
      default:
        console.log(` Unknown message $ {
      m.event
    } `);
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
      console.error(` No more black cards available in game $ {
      game.id
    } `);
      return
    }
  }

  playerDrawCards(game: Game, player: Player) {
    while (player.cards.length < 10) {
      const card = game.cards.white.pop();
      if (!card) {
        console.error(` No more white cards available in game $ {
      game.id
    } `);
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
        console.log(` Expiring game $ {
      game.id
    } `);
        delete this.games[game.id];
      }
    }
  }
}

