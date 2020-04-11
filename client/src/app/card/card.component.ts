import {Component, Input, OnInit, ViewChild} from '@angular/core';
import * as $ from 'jquery';

@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.css'],
})
export class CardComponent implements OnInit {
  @Input() black: boolean = false;
  @Input() content: string = '';
  @Input() flippable: boolean = false;
  @Input() back: boolean = false;
  @Input('class') className: string;
  @ViewChild('card') div;
  cardClass: string;

  constructor() {}

  ngOnInit(): void {
    console.log(this.black);
    if (this.black) {
      this.cardClass = 'black-card';
    } else {
      this.cardClass = 'white-card';
    }
  }

  ngAfterViewInit() {
    if (this.back) {
      $(this.div.nativeElement, '.flip-card').addClass('flip-card-hover');
    }
  }

  toggle() {
    if (this.flippable) {
      if (this.back) {
        $(this.div.nativeElement, '.flip-card').removeClass('flip-card-hover');
        this.back = false;
      } else {
        $(this.div.nativeElement, '.flip-card').addClass('flip-card-hover');
        this.back = true;
      }
    }
  }

  get fontSize(): string {
    if (this.content.length > 150) {
      return '13pt';
    };
    if (this.content.length > 125) {
      return '14pt';
    };
    if (this.content.length > 100) {
      return '15pt';
    };
    if (this.content.length > 75) {
      return '16pt';
    };
    if (this.content.length > 50) {
      return '17pt';
    };
    if (this.content.length > 20) {
      return '18pt';
    };
    return '20pt';
  }
}
