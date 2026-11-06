import { type CSSProperties } from "react";

export enum POPUP_TYPE {
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS'
}

export const ERROR_STYLE: CSSProperties = {
    backgroundColor: 'rgb(244, 67, 54)',
    color: 'white'
}

export const SUCCESS_STYLE: CSSProperties = {
    backgroundColor: 'rgb(76, 175, 80)',
    color: 'white'
}