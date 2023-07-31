import * as gIF from './gIF';

export const BE = false;
export const LE = true;
export const HEAD_LEN = 5;
export const LEN_IDX = 2;
export const CRC_IDX = 4;

export const SL_START_CHAR = 0x01;
export const SL_ESC_CHAR = 0x02;
export const SL_END_CHAR = 0x03;

export const SL_MSG_LOG = 0x8001;
export const SL_MSG_TESTPORT = 0x0a09;
export const SL_MSG_USB_CMD = 0x0a0d;

export const USB_CMD_KEEP_AWAKE = 0x01;
export const USB_CMD_FACTORY_RESET = 0x02;
export const USB_CMD_SOFTWARE_RESET = 0x03;
export const USB_CMD_RD_KEYS = 0x04;
export const USB_CMD_WR_KEYS = 0x05;
export const USB_CMD_RD_NODE_DATA_0 = 0x06;
export const USB_CMD_WR_NODE_DATA_0 = 0x0a;
export const USB_CMD_READ_PART_NUM = 0x0e;

export const USB_CMD_STATUS_OK = 0x00;
export const USB_CMD_STATUS_FAIL = 0x01;

export const ISP_RESET_REQ = 0x14;
export const ISP_RESET_RSP = 0x15;
export const ISP_GET_DEVICE_INFO_REQ = 0x32;
export const ISP_GET_DEVICE_INFO_RSP = 0x33;
export const ISP_OPEN_MEMORY_FOR_ACCESS_REQ = 0x40;
export const ISP_OPEN_MEMORY_FOR_ACCESS_RSP = 0x41;
export const ISP_ERASE_MEMORY_REQ = 0x42;
export const ISP_ERASE_MEMORY_RSP = 0x43;
export const ISP_BLANK_CHECK_MEMORY_REQ = 0x44;
export const ISP_BLANK_CHECK_MEMORY_RSP = 0x45;
export const ISP_READ_MEMORY_REQ = 0x46;
export const ISP_READ_MEMORY_RSP = 0x47;
export const ISP_WRITE_MEMORY_REQ = 0x48;
export const ISP_WRITE_MEMORY_RSP = 0x49;
export const ISP_CLOSE_MEM_REQ = 0x4A;
export const ISP_CLOSE_MEM_RSP = 0x4B;
export const ISP_GET_MEMORY_INFO_REQ = 0x4C;
export const ISP_GET_MEMORY_INFO_RSP = 0x4D;
export const ISP_UNLOCK_REQ = 0x4E;
export const ISP_UNLOCK_RSP = 0x4F;
