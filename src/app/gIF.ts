
export enum eRxState {
    E_STATE_RX_WAIT_START,
    E_STATE_RX_WAIT_TYPELSB,
    E_STATE_RX_WAIT_TYPEMSB,
    E_STATE_RX_WAIT_LENLSB,
    E_STATE_RX_WAIT_LENMSB,
    E_STATE_RX_WAIT_CRC,
    E_STATE_RX_WAIT_DATA,
}

export interface rdKeys_t {
    status: number;
    nwkKey: string;
    panId: number;
}

export interface slMsg_t {
    type: number;
    data: number[];
}

export interface msgLogs_t {
    text: string;
    color: string;
    id: number;
}



