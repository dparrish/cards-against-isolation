import {Injectable} from '@angular/core';
import {Observable, Observer} from 'rxjs'
import * as io from 'socket.io-client';
import {environment} from '../environments/environment';

import {Message} from '../message';

@Injectable({providedIn: 'root'})
export class SocketService {
  private socket;

  public connect(): void {
    this.socket = io(environment.server_url);
  }

  public send(message: Message): void {
    this.socket.emit('message', message);
  }

  public onConnect(): Observable<any> {
    return new Observable<any>(observer => {
      this.socket.on('connect', () => observer.next());
    });
  }

  public onMessage(): Observable<Message> {
    return new Observable<Message>(observer => {
      this.socket.on('message', (data: Message) => observer.next(data));
    });
  }
}
