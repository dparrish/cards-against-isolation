import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import * as $ from 'jquery';
import * as _ from 'lodash';
import {CookieService} from 'ngx-cookie-service';
import * as card_data from 'src/json-against-humanity/full.md.json';
import * as uuid from 'uuid';

import {Message} from '../../message';
import {SocketService} from '../socket.service';

const DEFAULT_DECKS = [
  '90s',      'Base',  'Box',    'CAHe1',  'CAHe2',   'CAHe3',   'CAHe4', 'CAHe5', 'CAHe6',    'fantasy',  'food',
  'greenbox', 'HOCAH', 'period', 'reject', 'reject2', 'science', 'weed',  'www',   'xmas2012', 'xmas2013',
];

@Component({selector: 'app-create-game', templateUrl: './create-game.component.html', styleUrls: ['./create-game.component.css']})
export class CreateGameComponent implements OnInit {
  decks = [];
  gameId: string = '';
  cardCount = 0;
  enabledDecks = DEFAULT_DECKS;

  constructor(private router: Router, private socket: SocketService, private cookie: CookieService) {}

  ngOnInit(): void {
    this.decks = [];
    for (const key in card_data.metadata) {
      if (!card_data.metadata.hasOwnProperty(key)) {
        continue;
      }
      const value = card_data.metadata[key];
      this.decks.push({
        id: key,
        name: _.replace(value.name, /\[[^\]]+\] /, ''),
        official: value.official,
        icon: value.icon,
        checked: _.includes(DEFAULT_DECKS, key),
      });
    }

    this.decks = _.sortBy(this.decks, ['name']);
    this.decks = _.flatten([
      _.filter(this.decks, d => d.official),
      _.filter(this.decks, d => !d.official),
    ]);
    this.socket.connect();

    this.enabledDecks = _.map(_.filter(this.decks, deck => _.includes(DEFAULT_DECKS, deck.id)), deck => deck.id);
    this.cardCount = _.sum([
      _.filter(card_data.black, deck => _.includes(this.enabledDecks, deck.deck)).length,
      _.filter(card_data.white, deck => _.includes(this.enabledDecks, deck.deck)).length,
    ]);
  }

  startGame() {
    this.gameId = _.replace(this.gameId.trim(), /[^A-Za-z0-9]+/g, '-');
    if (this.gameId.length < 5) {
      window.alert('Game name too short (minimum 5 letters)');
      return;
    }
    if (this.gameId.length > 50) {
      window.alert('Game name too long (maximum 50 letters)');
      return;
    }
    if (this.enabledDecks.length == 0) {
      window.alert('You must start a game with at least one deck');
      return;
    }

    this.socket.onMessage().subscribe((message: Message) => {
      if (message.event == 'game_created') {
        this.router.navigate([`/${message.game}`]);
      }
    });

    this.socket.send({
      event: 'create_game',
      player: this.getPlayerId(),
      game: this.gameId,
      decks: this.enabledDecks,
    });
  }

  getPlayerId(): string {
    let id = this.cookie.get('player-id');
    if (!id) {
      id = uuid.v4();
      this.cookie.set('player-id', id);
    }
    return id;
  }

  toggleDeck(id: string) {
    if ($(`#deck-${id}`)[0].checked) {
      this.enabledDecks.push(id);
    } else {
      _.remove(this.enabledDecks, i => i == id);
    }
    this.cardCount = _.sum([
      _.filter(card_data.black, deck => _.includes(this.enabledDecks, deck.deck)).length,
      _.filter(card_data.white, deck => _.includes(this.enabledDecks, deck.deck)).length,
    ]);
  }
}
