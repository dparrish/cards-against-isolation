import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

import {CreateGameComponent} from './create-game/create-game.component';
import {GameComponent} from './game/game.component';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/create',
  },
  {
    path: 'create',
    component: CreateGameComponent,
  },
  {
    path: ':id',
    component: GameComponent,
  },
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {
}
