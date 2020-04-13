import {animate, state, style, transition, trigger} from '@angular/animations';
import {Component, OnInit, ViewChild, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {faCheckCircle, faTimesCircle} from '@fortawesome/free-regular-svg-icons';
import {ModalDismissReasons, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Howl, Howler} from 'howler';
import * as $ from 'jquery';
import * as _ from 'lodash';
import * as moment from 'moment';
import {CookieService} from 'ngx-cookie-service';
import * as card_data from 'src/json-against-humanity/full.md.json';
import * as uuid from 'uuid';

import {Message} from '../../message';
import {SocketService} from '../socket.service';
import {ToastService} from '../toast-service';

interface Player {
  id: string;
  name: string;
  score: number;
  czar: boolean;
  playedCards: string[];
}

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class GameComponent implements OnInit {
  @ViewChild('voteModal') voteModal;
  title = 'Cards Against Isolation';
  gameId = 'abc123';
  playerId: string;
  playerName: string;
  players: Player[] = [];
  randomizedPlayers: Player[] = [];
  playersById: any = {};
  myCards: string[] = [];
  blackCard: string;
  playedCards: string[] = [];
  cardsPlayed: any = {};
  waiting: any[] = [];
  cards = {
    black: [],
    white: [],
  };
  game: any = {
    players: [],
  };
  czar = '';
  decks = ['Base', 'Box'];
  vote: any = {};
  winner: any = null;
  sfx = {
    cheer: null,
    shuffle: null,
  };

  constructor(
      private route: ActivatedRoute, private router: Router, private cookie: CookieService, private socket: SocketService, private modalService: NgbModal,
      private toast: ToastService) {
    this.sfx.cheer = new Howl({src: ['/assets/sfx/5_Sec_Crowd_Cheer-Mike_Koenig-1562033255.mp3'], preload: true, volume: 0.25});
    this.sfx.shuffle = new Howl({src: ['/assets/sfx/Cards Shuffling-SoundBible.com-565963092.mp3'], preload: true, volume: 0.25});
  }

  ngOnInit() {
    this.playerId = this.getPlayerId();
    this.initIoConnection();
    this.gameId = this.route.snapshot.paramMap.get('id');
  }

  initIoConnection(): void {
    this.socket.connect();
    this.socket.onConnect().subscribe(() => {
      this.myCards = [];
      this.playedCards = [];
      this.socket.send({
        event: 'join_game',
        player: this.playerId,
        game: this.gameId,
      });
    });
    this.socket.onMessage().subscribe((message: Message) => {
      if (message.event == 'game_update') {
        for (const player of this.game.players) {
          for (const newplayer of message.game.players) {
            if (newplayer.id != player.id) continue;
            if (newplayer.score != player.score) {
              this.toast.show(`${newplayer.name} won that round!`);
            }
          }
        }
        this.game = message.game;

        // Update players.
        for (const player of this.game.players) {
          if (player.id != this.playerId) continue;
          this.playerName = player.name;
          this.myCards = player.cards;
        }
        this.players = this.game.players;
        // Don't really randomize, just sort by the first card. It's not in the
        // same player order every time at least, and it's stable between
        // refreshes.
        this.randomizedPlayers = _.sortBy(this.game.players, p => p.playedCards[0]);
        this.playersById = {};
        for (const player of this.players) {
          this.playersById[player.id] = player;
        }

        // Update black card.
        this.blackCard = this.game.blackCard;
        this.cardsPlayed = {};

        this.updateWaiting();
        this.czar = this.game.czar;

        if (this.game.state == 'choose_winner') {
          this.playedCards = [];
        }
      } else if (message.event == 'end_round') {
        this.winner = {
          winner: this.playersById[message.winner].name,
          blackCard: message.args.blackCard,
          playedCards: message.args.playedCards,
          score: message.args.score,
          nextCzar: this.playersById[message.args.nextCzar].name,
        };
        console.log(message);
        console.log(this.winner);
        this.sfx.cheer.play();
      } else if (message.event == 'invalid_game') {
        this.router.navigate([`/create`]);
      } else if (message.event == 'game_created') {
      } else if (message.event == 'draw_card') {
        this.myCards.push(message.card);
      } else if (message.event == 'vote_start') {
        this.vote = {
          title: message.args.title,
          timeout: message.args.timeout,
          required: message.args.required,
          expires: moment().add(message.args.timeout, 'second'),
        };
        this.vote.timeLeft = Math.round(moment.duration(this.vote.expires.diff(moment())).as('seconds'));
        this.vote.interval = setInterval(() => {
          if (!this.vote) {
            return;
          }
          this.vote.timeLeft = Math.round(moment.duration(this.vote.expires.diff(moment())).as('seconds'));
        }, 1000);
        this.modalService.open(this.voteModal);
      } else if (message.event == 'vote_failed') {
        if (this.vote) {
          this.toast.show(`Vote to ${this.vote.title} did not pass`);
          clearInterval(this.vote.interval);
          this.modalService.dismissAll();
          this.vote = {};
        }
      } else if (message.event == 'vote_passed') {
        if (this.vote) {
          this.toast.show(`Vote to ${this.vote.title} passed`);
          clearInterval(this.vote.interval);
          this.modalService.dismissAll();
          this.vote = {};
        }
      } else if (message.event == 'play_card') {
        this.cardsPlayed[message.player] = message.cards;
        this.updateWaiting();
      } else {
        console.log(`Unknown message`, message);
      }
    });
  }

  get cardsToPlay(): number {
    return (this.game.blackCard.match(/_/g) || []).length || 1;
  }

  nextRound() {
    this.winner = null;
    this.sfx.shuffle.play();
  }

  get cardSlots(): string[] {
    const slots = [];
    for (let i = 0; i < this.cardsToPlay; i++) {
      if (this.playedCards[i]) {
        slots[i] = this.playedCards[i];
      } else {
        slots[i] = null;
      }
    }
    return slots;
  }

  public updateWaiting() {
    this.waiting = [];
    for (const player of this.players) {
      if (player.czar) continue;
      if (player.playedCards.length != this.cardsToPlay) {
        this.waiting.push(player);
      }
    }
  }

  fontSize(text: string): string {
    if (text.length > 150) {
      return '13pt';
    };
    if (text.length > 125) {
      return '14pt';
    };
    if (text.length > 100) {
      return '15pt';
    };
    if (text.length > 75) {
      return '16pt';
    };
    if (text.length > 50) {
      return '17pt';
    };
    if (text.length > 20) {
      return '18pt';
    };
    return '20pt';
  }

  newBlackCard() {
    const card = this.cards.black[0];
    this.blackCard = card;
  }

  getWhiteCards() {
    const cards = _.sampleSize(this.cards.white, 10 - this.myCards.length);
    for (const card of cards) {
      this.myCards.push(card);
    }
  }

  playCard(card: string) {
    if (this.playedCards.length && _.includes(this.playedCards, card)) {
      return;
    }
    this.playedCards.push(card);
    if (this.playedCards.length > this.cardsToPlay) {
      this.playedCards = this.playedCards.slice(1, this.cardsToPlay + 1);
    }
    for (let i = 0; i < this.cardSlots.length; i++) {
      if (this.cardSlots[i]) continue;
      this.cardSlots[i] = card;
      break;
    }
    this.sendCards();
  }

  removeCard(card: string) {
    if (_.remove(this.playedCards, c => c == card)) {
      this.socket.send({
        event: 'play_card',
        game: this.gameId,
        player: this.playerId,
        cards: this.playedCards,
      });
    }
  }

  getPlayerId(): string {
    let id = this.cookie.get('player-id');
    if (!id) {
      id = uuid.v4();
      this.cookie.set('player-id', id);
    }
    return id;
  }

  chooseWinner(playerId: string): void {
    this.socket.send({
      event: 'choose_winner',
      player: this.playerId,
      winner: playerId,
      game: this.gameId,
    });
  }

  endThisRound(): void {
    this.socket.send({
      event: 'end_round',
      player: this.playerId,
      game: this.gameId,
    });
  }

  editName(modal) {
    this.modalService.open(modal).result.then(result => {
      if (result == 'save') {
        this.socket.send({
          event: 'set_player_name',
          player: this.playerId,
          game: this.gameId,
          text: this.playerName,
        });
      }
    });
    return false;
  }

  skipCard() {
    this.socket.send({
      event: 'start_vote',
      player: this.playerId,
      game: this.gameId,
      text: `Skip this card`,
      args: {
        type: 'skip-card',
        timeout: 30,
      },
    });
    return false;
  }

  kickPlayer(id: string) {
    this.socket.send({
      event: 'start_vote',
      player: this.playerId,
      game: this.gameId,
      text: `Kick ${this.playersById[id].name}`,
      args: {
        type: 'kick-player',
        player: id,
        timeout: 30,
      },
    });
    return false;
  }

  flipCard(player: string, card: string) {
    console.log(`Flipping player ${player} card "${card}"`);
  }

  waitIcon(id: string): any {
    for (const player of this.waiting) {
      if (player.id == id) return faTimesCircle;
    }
    return faCheckCircle;
  }

  dragFrom = '';
  dragCard = '';

  startPlayCard(event) {
    this.dragFrom = 'my';
    this.dragCard = event.target.innerText;
  }

  startRemoveCard(event) {
    if ($('empty-card', event.target).length) {
      return false;
    }
    let t = event.target.childNodes[0];
    if (_.includes(t.classList, 'game-card')) {
      let m = t.id.match(/slot-([0-9+])/);
      const i = parseInt(m[1]);
      this.dragFrom = 'slot-' + i;
      this.dragCard = t.innerText;
    }
    return true;
  }

  dropPlayCard(event) {
    for (let t = event.target; t; t = t.parentNode) {
      if (_.includes(t.classList, 'game-card')) {
        // Play a card.
        let m = t.id.match(/slot-([0-9+])/);

        if (this.playedCards.length && this.dragFrom == 'my' && _.includes(this.playedCards, this.dragCard)) {
          return;
        }

        this.playedCards[parseInt(m[1])] = this.dragCard;

        m = this.dragFrom.match(/slot-([0-9+])/);
        if (m) {
          this.playedCards[parseInt(m[1])] = '';
        }
        this.dragCard = '';
        this.dragFrom = '';
        this.sendCards();
        return;
      }
    }
  }

  sendCards() {
    this.socket.send({
      event: 'play_card',
      game: this.gameId,
      player: this.playerId,
      cards: _.filter(this.playedCards, c => c),
    });
  }

  dropRemoveCard(event) {
    for (let i = 0; i < this.playedCards.length; i++) {
      if (this.playedCards[i] == this.dragCard) {
        this.playedCards[i] = '';
        this.sendCards();
        break;
      }
    }
  }

  allowDrop(event) {
    for (let t = event.target; t; t = t.parentNode) {
      if (_.includes(t.classList, 'empty-card')) {
        event.preventDefault();
        return true;
      }
    }
    return false;
  }

  castVote(option: string) {
    this.socket.send({
      event: 'vote',
      player: this.playerId,
      game: this.gameId,
      text: option,
    });
  }
}
