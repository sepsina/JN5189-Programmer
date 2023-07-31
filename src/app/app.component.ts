import { Component, NgZone, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { GlobalsService } from './globals.service';
import { EventsService } from './events.service';
import { SerialService } from './serial.service';
import { UtilsService } from './utils.service';
import { Validators, FormGroup, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';

import fileDialog from 'file-dialog';

import * as gIF from './gIF';
import * as gConst from './gConst';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {

    logs: gIF.msgLogs_t[] = [];
    scrollFlag = true;

    binPath = '';

    constructor(public serial: SerialService,
                public globals: GlobalsService,
                private events: EventsService,
                private utils: UtilsService,
                private ngZone: NgZone) {
        // ---
    }

    /***********************************************************************************************
     * fn          ngOnDestroy
     *
     * brief
     *
     */
    ngOnDestroy() {
        this.serial.closeComPort();
    }

    /***********************************************************************************************
     * fn          ngOnInit
     *
     * brief
     *
     */
    ngOnInit() {

        window.onbeforeunload = ()=>{
            this.ngOnDestroy();
        };

        this.events.subscribe('logMsg', (msg: gIF.msgLogs_t)=>{
            const last = this.logs.slice(-1)[0];
            if(this.logs.length && (last.id === 7) && (msg.id === 7)){
                this.ngZone.run(()=>{
                    this.logs[this.logs.length - 1] = msg;
                });
            }
            else {
                while(this.logs.length >= 20) {
                    this.logs.shift();
                }
                this.ngZone.run(()=>{
                    this.logs.push(msg);
                });
            }
            if(this.scrollFlag == true) {
                let logsDiv = document.getElementById('logList');
                logsDiv.scrollTop = logsDiv.scrollHeight;
            }
        });
    }

    /***********************************************************************************************
     * fn          autoScrollChange
     *
     * brief
     *
     */
    autoScrollChange(scroll) {
        console.log(scroll);
        this.scrollFlag = scroll;
        if(scroll == true) {
            let logsDiv = document.getElementById('logList');
            logsDiv.scrollTop = logsDiv.scrollHeight;
        }
    }

    /***********************************************************************************************
     * fn          clearLogs
     *
     * brief
     *
     */
    clearLogs() {
        this.logs = [];
    }

    /***********************************************************************************************
     * fn          selBinFile
     *
     * brief
     *
     */
    selBinFile() {
        fileDialog({ multiple: false, accept: '.bin'}).then((files)=>{
            const file: any = files[0];
            if(file){
                this.binPath = file.name;
                this.utils.sendMsg(`bin path: ${file.path}`);
                this.serial.readBin(file.path);
            }
        });
    }

}
