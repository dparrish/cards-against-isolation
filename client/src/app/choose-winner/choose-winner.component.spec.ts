import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ChooseWinnerComponent } from './choose-winner.component';

describe('ChooseWinnerComponent', () => {
  let component: ChooseWinnerComponent;
  let fixture: ComponentFixture<ChooseWinnerComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ChooseWinnerComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ChooseWinnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
