import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FontAwesomeModule} from '@fortawesome/angular-fontawesome';
import {NgbModule} from '@ng-bootstrap/ng-bootstrap';

import {environment} from '../environments/environment';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {CardComponent} from './card/card.component';
import {CreateGameComponent} from './create-game/create-game.component';
import {GameComponent} from './game/game.component';
import {ToastsContainer} from './toasts-container.component';
import { GameBoardComponent } from './game-board/game-board.component';
import { CongratulationsComponent } from './congratulations/congratulations.component';
import { ChooseWinnerComponent } from './choose-winner/choose-winner.component';

@NgModule({
  declarations: [
    AppComponent,
    CreateGameComponent,
    GameComponent,
    CardComponent,
    ToastsContainer,
    GameBoardComponent,
    CongratulationsComponent,
    ChooseWinnerComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    NgbModule,
    FormsModule,
    HttpClientModule,
    ReactiveFormsModule,
    FontAwesomeModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
