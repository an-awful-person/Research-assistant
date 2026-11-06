export interface Service {
    init:() => void;
    exit:() => void;
}