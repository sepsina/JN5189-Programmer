///<reference types="chrome"/>
//'use strict';
import { Injectable, NgZone } from '@angular/core';
import { EventsService } from './events.service';
import { GlobalsService } from './globals.service';
import { UtilsService } from './utils.service';
import * as gIF from './gIF';
import * as gConst from './gConst';

import { buf } from 'crc-32';

const SL_TMO = 500;
const RX_SIZE = 256;
const TX_SIZE = 2048;
const RSP_START_IDX = 5;

const LE = true;
const BE = false;
const LEN_IDX = 1;
const CRC_LEN = 4;

//const WR_TMO = 800;
const TMO_CNT = 3;

enum eState {
    IDLE_STATE,
    ISP_UNLOCK_STATE,
    DEV_INFO_STATE,
    MEM_INFO_STATE,
    OPEN_MEM_STATE,
    ERASE_FLASH_STATE,
    BLANK_CHECK_STATE,
    WRITE_FLASH_STATE,
    CLOSE_MEM_STATE
}
const noPort = {
    displayName: '',
    path: '- - - - -',
    productId: 0,
    vendorId: 0
}

const ORANGE = 'orangered';
const RED = 'red';
const GREEN = 'green';
const BLUE = 'blue';
const OLIVE = 'olive';
const PURPLE = 'purple'
const CHOCOLATE = 'chocolate';

const sleep = (ms: number)=>new Promise((r)=>setTimeout(r, ms));

@Injectable({
    providedIn: 'root',
})
export class SerialService {

    //searchPortFlag = false;
    validPortFlag = false;
    portOpenFlag = false;
    private portIdx = 0;
    portPath = '';

    private msgIdx = 0;
    private rxBuf = new ArrayBuffer(RX_SIZE);
    private rxMsg = new Uint8Array(this.rxBuf);

    private txBuf = new ArrayBuffer(TX_SIZE);
    private txMsg = new Uint8Array(this.txBuf);

    comPorts = [];
    allPorts = [];
    connID = -1;
    checkPortsFlag = false;
    unlockFlag = false;

    selPort = noPort;

    ispState: eState = eState.IDLE_STATE;
    rspFlags = 0;
    rspLen = 0;
    rspType = 0;
    rspStatus = 0;

    slTMO: any;
    tmoCnt = TMO_CNT;

    chipID = '';
    version = '';
    flashSize = 0;
    sectSize = 0;

    binData: any;
    binFlag = false;
    binSector = 0;
    wrSector = 0;
    binRemainder = 0;
    wrFlashFlag = false;
    binProgress = 0;

    memOpenFlag = false;
    memHandle: number;

    trash: any;

    fs: any;

    constructor(private events: EventsService,
                private globals: GlobalsService,
                private utils: UtilsService,
                private ngZone: NgZone) {
        this.comPorts.push(noPort);

        chrome.serial.onReceive.addListener((info)=>{
            if(info.connectionId === this.connID){
                this.slOnData(info.data);
            }
        });
        chrome.serial.onReceiveError.addListener((info: any)=>{
                this.rcvErrCB(info);
        });
        this.fs = window.nw.require('fs');

        setTimeout(()=>{
            this.listAllPorts();
        }, 1000);
    }

    /***********************************************************************************************
     * fn          slOnData
     *
     * brief
     *
     */
    private slOnData(msg) {

        let pkt = new Uint8Array(msg);

        for(let i = 0; i < pkt.length; i++) {
            switch(this.msgIdx){
                case 0: { // flags
                    this.rspFlags = pkt[i];
                    break;
                }
                case 1: { // len hi byte
                    this.rspLen = pkt[i] * 256;
                    break;
                }
                case 2: { // len lo byte
                    this.rspLen += pkt[i];
                    break;
                }
                case 3: { // type
                    this.rspType = pkt[i];
                    break;
                }
                case 4: { // status
                    this.rspStatus = pkt[i];
                    break;
                }
            }
            this.rxMsg[this.msgIdx++] = pkt[i];
            if((this.msgIdx >= this.rspLen) && (this.msgIdx >= 3)){
                this.tmoCnt = TMO_CNT;
                const ispRsp = new DataView(this.rxBuf);
                let rspIdx = 5;
                switch(this.rspType){
                    case gConst.ISP_UNLOCK_RSP: {
                        if(this.rspStatus == 0x00){
                            setTimeout(()=>{
                                this.getDevInfo();
                            }, 10);
                        }
                        else {
                            this.unlockFlag = false;
                            this.utils.sendMsg(`isp unlock err: ${this.rspStatus.toString(16).padStart(2, '0')}`, RED);
                        }
                        break;
                    }

                    case gConst.ISP_GET_DEVICE_INFO_RSP: {
                        if(this.rspStatus == 0x00){
                            let id = [];
                            for(let i = 0; i < 4; i++){
                                id[i] = (ispRsp.getUint8(rspIdx++)).toString(16).padStart(2, '0');
                            }
                            let ver = [];
                            for(let i = 0; i < 4; i++){
                                ver[i] = (ispRsp.getUint8(rspIdx++)).toString(16).padStart(2, '0');
                            }
                            this.ngZone.run(()=>{
                                this.chipID = id.join('-');
                                this.utils.sendMsg(`chip id: ${this.chipID}`);
                                this.version = ver.join('-');
                                this.utils.sendMsg(`version: ${this.version}`);
                            });
                            setTimeout(()=>{
                                this.getMemInfo();
                            }, 10);
                        }
                        else {
                            this.unlockFlag = false;
                            this.utils.sendMsg(`dev info err: ${this.rspStatus.toString(16).padStart(2, '0')}`, RED);
                        }
                        break;
                    }

                    case gConst.ISP_GET_MEMORY_INFO_RSP: {
                        if(this.rspStatus == 0x00){
                            const memID = ispRsp.getUint8(rspIdx++);
                            const baseAddr = ispRsp.getUint32(rspIdx, LE);
                            rspIdx += 4;
                            this.flashSize = ispRsp.getUint32(rspIdx, LE);
                            rspIdx += 4;
                            this.sectSize = ispRsp.getUint32(rspIdx, LE);
                            rspIdx += 4;
                            const type = ispRsp.getUint8(rspIdx++);
                            const access = ispRsp.getUint8(rspIdx++);

                            this.utils.sendMsg(`id: 0x${memID.toString(16).padStart(2, '0').toUpperCase()}`);
                            this.utils.sendMsg(`base-addr: 0x${baseAddr.toString(16).padStart(8, '0').toUpperCase()}`);
                            this.utils.sendMsg(`len: 0x${this.flashSize.toString(16).padStart(8, '0').toUpperCase()}`);
                            this.utils.sendMsg(`sect-size: 0x${this.sectSize.toString(16).padStart(8, '0').toUpperCase()}`);
                            this.utils.sendMsg(`type: 0x${type.toString(16).padStart(2, '0').toUpperCase()}`);
                            this.utils.sendMsg(`access: 0x${access.toString(16).padStart(2, '0').toUpperCase()}`);

                            if(this.wrFlashFlag == true){
                                setTimeout(() => {
                                    this.openMem(0x00, 0x0F);
                                }, 100);
                            }
                        }
                        else {
                            this.utils.sendMsg(`mem info err: ${this.rspStatus.toString(16).padStart(2, '0')}`, RED);
                        }
                        this.ngZone.run(()=>{
                            this.unlockFlag = false;
                        });
                        break;
                    }

                    case gConst.ISP_OPEN_MEMORY_FOR_ACCESS_RSP: {
                        if(this.rspStatus == 0x00){
                            this.memOpenFlag = true;
                            this.memHandle = ispRsp.getUint8(rspIdx++);
                            if(this.wrFlashFlag == true){
                                setTimeout(()=>{
                                    this.eraseMem(0, this.flashSize);
                                }, 10);
                            }
                        }
                        else {
                            this.utils.sendMsg(`open mem err: ${this.rspStatus.toString(16).padStart(2, '0')}`, RED);
                        }
                        break;
                    }

                    case gConst.ISP_ERASE_MEMORY_RSP: {
                        if(this.rspStatus == 0x00){
                            if(this.wrFlashFlag == true){
                                setTimeout(()=>{
                                    this.blankCheck(0, this.flashSize);
                                }, 10);
                            }
                        }
                        else {
                            this.errHandler(this.rspStatus);
                        }
                        break;
                    }

                    case gConst.ISP_BLANK_CHECK_MEMORY_RSP: {
                        if(this.rspStatus == 0x00){
                            if(this.wrFlashFlag == true){
                                setTimeout(()=>{
                                    this.writeMem();
                                }, 10);
                            }
                        }
                        else {
                            this.errHandler(this.rspStatus);
                        }
                        break;
                    }

                    case gConst.ISP_WRITE_MEMORY_RSP: {
                        if(this.rspStatus == 0x00){
                            this.wrSector++;
                            if(this.wrSector > this.binSector){
                                setTimeout(()=>{
                                    this.closeMem();
                                }, 10);
                            }
                            else {
                                setTimeout(()=>{
                                    this.writeMem();
                                }, 10);
                            }
                        }
                        else {
                            this.errHandler(this.rspStatus);
                        }
                        break;
                    }

                    case gConst.ISP_CLOSE_MEM_RSP: {
                        if(this.rspStatus == 0x00){
                            this.memOpenFlag = false;
                            if(this.wrFlashFlag == true){
                                this.wrFlashFlag = false;
                                this.ispState = eState.IDLE_STATE;
                                this.binProgress = 0;
                                this.utils.sendMsg('wr flash done', GREEN);
                            }
                        }
                        else {
                            console.log(`close mem err: ${this.rspStatus.toString(16).padStart(2, '0')}`);
                        }
                        break;
                    }
                }
                clearTimeout(this.slTMO);
                const crcIdx = this.rspLen - 4;
                const calcCRC = buf(this.rxMsg.slice(0, crcIdx));
                const crc = ispRsp.getInt32(crcIdx, gConst.BE);
                if(calcCRC != crc){
                    console.log('crc err !!!')
                }
            }
        }
    }

    /***********************************************************************************************
     * fn          closeComPort
     *
     * brief
     *
     */
    async closeComPort() {
        if(this.connID > -1){
            await this.closePortAsync(this.connID);
            this.connID = -1;
            this.portOpenFlag = false;
            this.validPortFlag = false;
        }
    }

    /***********************************************************************************************
     * fn          listAllPorts
     *
     * brief
     *
     */
    listAllPorts() {

        if(this.checkPortsFlag == false){
            chrome.serial.getDevices((ports)=>{
                this.allPorts = ports;
                this.comPorts = [];
                this.comPorts.push(noPort);
                this.ngZone.run(()=>{
                    this.chipID = '';
                    this.version = '';
                    this.flashSize = 0;
                    this.sectSize = 0;
                    this.selPort = this.comPorts[0];
                });
                if(this.allPorts.length) {
                    setTimeout(()=>{
                        this.checkPort();
                    }, 10);
                }
            });
        }
    }

    /***********************************************************************************************
     * fn          checkPort
     *
     * brief
     *
     */
    async checkPort() {

        await this.closeComPort();

        if(this.checkPortsFlag == false){
            this.checkPortsFlag = true;
            this.portIdx = 0;
        }
        else {
            this.portIdx++;
        }
        if(this.portIdx >= this.allPorts.length){
            this.ngZone.run(()=>{
                this.checkPortsFlag = false;
            });
            return;
        }
        this.portPath = this.allPorts[this.portIdx].path;
        const connOpts = {
            bitrate: 115200
        };
        const connInfo: any = await this.serialConnectAsync(connOpts);
        if(connInfo){
            this.connID = connInfo.connectionId;
            this.comPorts.push(this.allPorts[this.portIdx]);
            this.utils.sendMsg(`valid: ${this.portPath}`, BLUE);
        }
        else {
            const err = chrome.runtime.lastError.message;
            this.utils.sendMsg(`${this.portPath} not valid`, OLIVE);
        }

        setTimeout(()=>{
            this.checkPort();
        }, 10);
    }

    /***********************************************************************************************
     * fn          errHandler
     *
     * brief
     *
     */
    errHandler(status: number) {
        switch(this.ispState){
            case eState.ERASE_FLASH_STATE: {
                this.utils.sendMsg(`erase mem err: ${status.toString(16).padStart(2, '0')}`);
                break;
            }
            case eState.BLANK_CHECK_STATE: {
                this.utils.sendMsg(`blank check err: ${this.rspStatus.toString(16).padStart(2, '0')}`);
                break;
            }
            case eState.WRITE_FLASH_STATE: {
                this.utils.sendMsg(`write flash err: ${this.rspStatus.toString(16).padStart(2, '0')}`);
                break;
            }
        }
        if(this.wrFlashFlag == true) {
            this.stopWriteFlash();
        }
    }

    /***********************************************************************************************
     * fn          serialSend
     *
     * brief
     *
     */
    async serialSend(len: number) {

        this.rspLen = 0;
        this.msgIdx = 0;

        clearTimeout(this.slTMO);
        this.slTMO = setTimeout(()=>{
            this.serialTMO();
        }, SL_TMO);

        let slMsg = this.txMsg.slice(0, len);

        const sendInfo: any = await this.serialSendAsync(slMsg);
        if(sendInfo.error){
            this.utils.sendMsg(`send err: ${sendInfo.error}`, RED);
        }
    }

    /***********************************************************************************************
     * fn          rcvErrCB
     *
     * brief
     *
     */
    async rcvErrCB(info: any) {
        if(info.connectionId === this.connID){
            switch(info.error){
                case 'disconnected': {
                    this.utils.sendMsg(`${this.portPath} disconnected`);
                    break;
                }
                case 'device_lost': {
                    this.utils.sendMsg(`${this.portPath} lost`, RED);
                    break;
                }
                case 'system_error': {
                    break;
                }
                case 'timeout':
                case 'break':
                case 'frame_error':
                case 'overrun':
                case 'buffer_overflow':
                case 'parity_error': {
                    // ---
                    break;
                }
            }
        }
    }
    /***********************************************************************************************
     * fn          sl_tmo
     *
     * brief
     *
     */
    serialTMO() {
        switch(this.ispState) {
            case eState.ISP_UNLOCK_STATE: {
                this.unlockFlag = false;
                this.utils.sendMsg('isp unlock TMO', ORANGE);
                break;
            }
            case eState.DEV_INFO_STATE: {
                this.unlockFlag = false;
                this.utils.sendMsg('dev info TMO', ORANGE);
                break;
            }
            case eState.MEM_INFO_STATE: {
                this.unlockFlag = false;
                if(this.wrFlashFlag == true) {
                    this.stopWriteFlash();
                }
                this.utils.sendMsg('mem info TMO', ORANGE);
                break;
            }
            case eState.BLANK_CHECK_STATE: {
                this.utils.sendMsg('blank check TMO', ORANGE);
                if(this.tmoCnt > 0){
                    this.tmoCnt--;
                    setTimeout(()=>{
                        this.blankCheck(0, this.flashSize);
                    }, 10);
                }
                else {
                    if(this.wrFlashFlag == true) {
                        this.stopWriteFlash();
                    }
                }
                break;
            }
            case eState.WRITE_FLASH_STATE: {
                this.utils.sendMsg('write flash TMO', ORANGE);
                if(this.tmoCnt > 0){
                    this.tmoCnt--;
                    setTimeout(()=>{
                        this.writeMem();
                    }, 10);
                }
                else {
                    if(this.wrFlashFlag == true) {
                        this.stopWriteFlash();
                    }
                }
                break;
            }
            case eState.CLOSE_MEM_STATE: {
                this.utils.sendMsg('mem close TMO', ORANGE);
                break;
            }
            default: {
                this.utils.sendMsg('isp req TMO', ORANGE);
                break;
            }
        }
    }
    /***********************************************************************************************
     * fn          enterISP
     *
     * brief
     *
     */
    enterISP() {
        if(this.connID == -1){
            this.utils.sendMsg(`no serial connection`, CHOCOLATE);
            return;
        }
        if(this.wrFlashFlag == true){
            this.utils.sendMsg(`busy`, CHOCOLATE);
            return;
        }
        this.ngZone.run(()=>{
            this.unlockFlag = true;
        });
        // dtr and rts are active low signals => true->low level
        chrome.serial.setControlSignals(this.connID, { dtr: true, rts: true }, (result: boolean)=>{
            setTimeout(()=>{
                chrome.serial.setControlSignals(this.connID, { rts: false }, (result: boolean)=>{
                    setTimeout(()=>{
                        chrome.serial.setControlSignals(this.connID, { dtr: false }, (result: boolean)=>{
                            this.chipID = '';
                            this.version = '';
                            this.flashSize = 0;
                            this.sectSize = 0;
                            this.utils.sendMsg('enter isp done', PURPLE);
                            setTimeout(()=>{
                                this.ispUnlockToStart();
                            }, 10);
                        });
                    }, 50);
                });
            }, 50);
        });
    }

    /***********************************************************************************************
     * fn          ispUnlock
     *
     * brief
     *
     */
    ispUnlock() {

        if(this.wrFlashFlag == true){
            this.utils.sendMsg(`busy`, CHOCOLATE);
            return;
        }
        this.utils.sendMsg(`isp unlock`, PURPLE);

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_UNLOCK_REQ); // type
        ispReq.setUint8(idx++, 0x00); // unlock to default

        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          ispUnlockToStart
     *
     * brief
     *
     */
    ispUnlockToStart() {

        if(this.wrFlashFlag == true){
            this.utils.sendMsg(`busy`, CHOCOLATE);
            return;
        }
        this.utils.sendMsg(`isp unlock`, PURPLE);
        this.ispState = eState.ISP_UNLOCK_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_UNLOCK_REQ); // type
        ispReq.setUint8(idx++, 0x01); // Start ISP
        // key
        const key = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
                     0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
        for(let i = 0; i < key.length; i++){
            ispReq.setUint8(idx++, key[i]);
        }
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          getDevInfo
     *
     * brief
     *
     */
    getDevInfo() {

        this.utils.sendMsg(`get dev info`, PURPLE);
        this.ispState = eState.DEV_INFO_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_GET_DEVICE_INFO_REQ); // type
        // req payload is empty
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          getMemInfo
     *
     * brief
     *
     */
    getMemInfo() {

        this.utils.sendMsg(`get flash info`, PURPLE);
        this.ispState = eState.MEM_INFO_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len
        ispReq.setUint8(idx++, gConst.ISP_GET_MEMORY_INFO_REQ); // type
        ispReq.setUint8(idx++, 0x00); // FLASH
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          openMem
     *
     * brief
     *
     */
    openMem(id: number, mode: number) {

        this.utils.sendMsg(`open mem`, PURPLE);
        this.ispState = eState.OPEN_MEM_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_OPEN_MEMORY_FOR_ACCESS_REQ); // type
        ispReq.setUint8(idx++, id); // mem id
        ispReq.setUint8(idx++, mode); // access mode
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          closeMem
     *
     * brief
     *
     */
    closeMem() {

        this.utils.sendMsg(`close mem`, PURPLE);
        this.ispState = eState.CLOSE_MEM_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_CLOSE_MEM_REQ); // type
        ispReq.setUint8(idx++, this.memHandle);
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          eraseMem
     *
     * brief
     *
     */
    eraseMem(addr: number, len: number) {

        this.utils.sendMsg(`erase mem`, PURPLE);
        this.ispState = eState.ERASE_FLASH_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_ERASE_MEMORY_REQ); // type
        ispReq.setUint8(idx++, this.memHandle);
        ispReq.setUint8(idx++, 0x00); // mode
        ispReq.setUint32(idx, addr, LE);
        idx += 4;
        ispReq.setUint32(idx, len, LE);
        idx += 4;
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          blankCheck
     *
     * brief
     *
     */
    blankCheck(addr: number, len: number) {

        this.utils.sendMsg(`blank check`, PURPLE);
        this.ispState = eState.BLANK_CHECK_STATE;

        let idx = 0;
        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_BLANK_CHECK_MEMORY_REQ); // type
        ispReq.setUint8(idx++, this.memHandle);
        ispReq.setUint8(idx++, 0x00); // mode
        ispReq.setUint32(idx, addr, LE);
        idx += 4;
        ispReq.setUint32(idx, len, LE);
        idx += 4;
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          writeMem
     *
     * brief
     *
     */
    writeMem() {

        let idx = 0;
        let len = 0;

        if(this.wrSector > this.binSector){
            return;
        }
        if(this.wrSector < this.binSector){
            len = this.sectSize;
        }
        if(this.wrSector == this.binSector){
            len = this.binRemainder;
        }
        if(len == 0){
            return;
        }
        this.ispState = eState.WRITE_FLASH_STATE;

        let binIdx = this.wrSector * this.sectSize;

        this.ngZone.run(()=>{
            this.binProgress = 100 * (binIdx + len) / this.binData.length;
        });
        this.utils.sendMsg(`--- ${this.binProgress.toFixed(1)}% ---`, GREEN, 7);

        const ispReq = new DataView(this.txBuf);

        ispReq.setUint8(idx++, 0x00);  // flags
        idx += 2; // skip len for now
        ispReq.setUint8(idx++, gConst.ISP_WRITE_MEMORY_REQ); // type
        ispReq.setUint8(idx++, this.memHandle);
        ispReq.setUint8(idx++, 0x00); // mode
        ispReq.setUint32(idx, binIdx, LE);
        idx += 4;
        ispReq.setUint32(idx, len, LE);
        idx += 4;
        for(let i = 0; i < len; i++){
            ispReq.setUint8(idx++, this.binData[binIdx++]);
        }
        ispReq.setUint16(LEN_IDX, (idx + CRC_LEN), BE);  // len
        const crc = buf(this.txMsg.slice(0, idx));
        ispReq.setUint32(idx, crc, BE);
        idx += 4;

        this.serialSend(idx);
    }

    /***********************************************************************************************
     * fn          readBin
     *
     * brief
     *
     */
    readBin(path: string) {

        if(this.wrFlashFlag == true){
            this.utils.sendMsg(`busy`, CHOCOLATE);
            return;
        }
        this.binData = this.fs.readFileSync(path);
        if(this.binData){
            this.binFlag = true;
        }
    }

    /***********************************************************************************************
     * fn          writeFlash
     *
     * brief
     *
     */
    writeFlash() {

        if((this.binFlag == true) && (this.sectSize > 0) && (this.wrFlashFlag == false)){
            this.binSector = Math.floor(this.binData.length / this.sectSize);
            this.wrSector = 0;
            this.binRemainder = this.binData.length % this.sectSize;
            this.ngZone.run(()=>{
                this.wrFlashFlag = true;
                this.binProgress = 0;
            });
            setTimeout(() => {
                this.getMemInfo();
            }, 10);
        }
        else {
            if(this.sectSize == 0){
                this.utils.sendMsg(`unlock isp`, CHOCOLATE);
            }
            else if(this.binFlag == false){
                this.utils.sendMsg(`select bin file`, CHOCOLATE);
            }
            else {
                this.utils.sendMsg(`busy`, CHOCOLATE);
            }
        }
    }
    /***********************************************************************************************
     * fn          stopWriteFlash
     *
     * brief
     *
     */
    stopWriteFlash() {

        this.wrFlashFlag = false;
        this.ispState = eState.IDLE_STATE;

        if(this.memOpenFlag == true){
            this.memOpenFlag = false;
            setTimeout(()=>{
                this.closeMem();
            }, 10);
        }
    }

    /***********************************************************************************************
     * fn          portSelChange
     *
     * brief
     *
     */
    async portSelChange(port){

        this.chipID = '';
        this.version = '';
        this.flashSize = 0;
        this.sectSize = 0;

        await this.closeComPort();

        if(port.value.path != noPort.path){
            this.portPath = port.value.path;
            const connOpts = {
                bitrate: 115200
            };
            const connInfo: any = await this.serialConnectAsync(connOpts);
            if(connInfo){
                this.connID = connInfo.connectionId;
                this.portOpenFlag = true;
                this.validPortFlag = true;
                this.utils.sendMsg(`open: ${this.portPath}`, BLUE);
            }
            else {
                setTimeout(() => {
                    this.ngZone.run(()=>{
                        this.selPort = this.comPorts[0];
                    });
                }, 10);
                this.utils.sendMsg(`open ${this.portPath} err: ${chrome.runtime.lastError.message}`, RED);
            }
        }
    }

    /***********************************************************************************************
     * fn          closePort
     *
     * brief
     *
     */
    closePortAsync(id: number) {
        return new Promise((resolve)=>{
            chrome.serial.disconnect(id, (result)=>{
                resolve(result);
            });
        });
    }

    /***********************************************************************************************
     * fn          serialConnectAsync
     *
     * brief
     *
     */
    serialConnectAsync(connOpt) {
        return new Promise((resolve)=>{
            chrome.serial.connect(this.portPath, connOpt, (connInfo)=>{
                resolve(connInfo);
            });
        });
    }

    /***********************************************************************************************
     * fn          serialSendAsync
     *
     * brief
     *
     */
    serialSendAsync(slMsg: any) {
        return new Promise((resolve)=>{
            chrome.serial.send(this.connID, slMsg.buffer, (sendInfo: any)=>{
                resolve(sendInfo);
            });
        });
    }

    /***********************************************************************************************
     * fn          listStatus
     *
     * brief
     *
     */
    listStatus(){

        let disabled: boolean;

        disabled = this.checkPortsFlag;
        disabled ||= this.unlockFlag;
        disabled ||= this.wrFlashFlag;

        return disabled;
    }

    /***********************************************************************************************
     * fn          unlockStatus
     *
     * brief
     *
     */
    unlockStatus(){

        let disabled: boolean;

        disabled = (this.portOpenFlag == false);
        disabled ||= this.checkPortsFlag;
        disabled ||= this.unlockFlag;
        disabled ||= this.wrFlashFlag;

        return disabled;
    }

    /***********************************************************************************************
     * fn          getFlashSize
     *
     * brief
     *
     */
    getFlashSize(){

        let size = '';

        if(this.flashSize){
            size = `${this.flashSize.toString(10)}`;
            size += ` (0x${this.flashSize.toString(16).padStart(8, '0').toUpperCase()})`;
        }

        return size;
    }

    /***********************************************************************************************
     * fn          getFlashSize
     *
     * brief
     *
     */
    getSectorSize(){

        let size = '';

        if(this.sectSize){
            size = `${this.sectSize.toString(10)}`;
            size += ` (0x${this.sectSize.toString(16).padStart(4, '0').toUpperCase()})`;
        }

        return size;
    }

    /***********************************************************************************************
     * fn              getFlashWrStatus

     *
     * brief
     *
     */
    getFlashWrStatus(){

        let disabled = false;

        if(this.portOpenFlag == false){
            disabled = true;
        }
        if(this.sectSize == 0){
            disabled = true;
        }
        if(this.binData){
            if(this.binData.length == 0){
                disabled = true;
            }
        }
        else {
            disabled = true;
        }
        if(this.wrFlashFlag == true){
            disabled = true;
        }

        return disabled;
    }

}
