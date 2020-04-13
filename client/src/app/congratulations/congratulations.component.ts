import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Howl} from 'howler';

@Component({
  selector: 'app-congratulations',
  templateUrl: './congratulations.component.html',
  styleUrls: ['./congratulations.component.css'],
})
export class CongratulationsComponent implements OnInit {
  @Input() winner: string;
  @Input() nextCzar: string;
  @Input() blackCard: string;
  @Input() cards: string[];
  @Input() score: number;
  @Output() done = new EventEmitter();
  cheer: any;

  constructor() {}

  ngOnInit(): void {
    this.cheer = new Howl({
      src: ['/assets/sfx/5_Sec_Crowd_Cheer-Mike_Koenig-1562033255.mp3'],
      preload: true,
      volume: 0.25,
    });
  }

  ngAfterViewInit() {
    this.cheer.play();
  }

  nextRound() {
    this.done.emit(true);
  }
}
