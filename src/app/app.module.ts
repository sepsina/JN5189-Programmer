import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule} from '@angular/forms';
import { AngularMaterialModule } from './angular-material/angular-material.module';

import { SliderModule } from 'primeng/slider'

@NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        FormsModule,
        ReactiveFormsModule,
        AngularMaterialModule,
        SliderModule
    ],
    providers: [],
    bootstrap: [AppComponent],
    entryComponents:[
        // ---
    ]
})
export class AppModule {
}
