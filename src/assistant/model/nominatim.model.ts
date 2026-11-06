/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Coordinate } from "ol/coordinate";

export enum NOMINATIM_OUTPUT_FORMAT {
    XML = "xml",
    JSON = "json",
    JSON2 = "jsonv2",
    GEOJSON = "geojson",
    GEOCODEJSON = "geocodejson"
}

export type NominatimJsonModel = {
    place_id?:number,
    licence?:string,
    osm_type?:string,
    osm_id?:string,
    boundingbox?:string[],
    lat?:string,
    lon?:string,
    display_name?:string,
    name?:string,
    addresstype?:string,
    class?:string,
    type?:string,
    importance?:number,
    icon?:string,
    address?:NominatimAddressModel,
    extratags?:{[key:string]: string}
    error?:string;
    geojson?:{[key:string]: any}
}

/**
 * For agent purposes
 */
export type NominatimJsonModelSimplified = {
    place_id?:number,
    display_name?:string,
    addresstype?:string,
    address?:NominatimAddressModel,
    extratags?:{[key:string]:string}
    lat?:string,
    lon?:string
}

export type NominatimAddressModel = {
    continent?:string;
    country?:string;
    country_code?:string;
    region?:string;
    state?:string;
    state_district?:string;
    county?:string,
    'ISO3166-2-lvl'?:string,
    municipality?:string,
    city?:string, 
    town?:string, 
    village?:string,
    city_district?:string, 
    district?:string, 
    borough?:string, 
    suburb?:string, 
    subdivision?:string,
    hamlet?:string, 
    croft?:string, 
    isolated_dwelling?:string,
    neighbourhood?:string, 
    allotments?:string, 
    quarter?:string,
    city_block?:string, 
    residential?:string, 
    farm?:string, 
    farmyard?:string, 
    industrial?:string, 
    commercial?:string, 
    retail?:string,
    road?:string,
    house_number?:string, 
    house_name?:string,
    emergency?:string, 
    historic?:string, 
    military?:string, 
    natural?:string, 
    landuse?:string, 
    place?:string, 
    railway?:string, 
    man_made?:string, 
    aerialway?:string, 
    boundary?:string, 
    amenity?:string, 
    aeroway?:string, 
    club?:string, 
    craft?:string, 
    leisure?:string, 
    office?:string, 
    mountain_pass?:string, 
    shop?:string, 
    tourism?:string, 
    bridge?:string, 
    tunnel?:string, 
    waterway?:string,
    postcode?:string,
}

export type NominatimSearchOptions = {
    addressdetails?: '0'|'1',
    extratags?: '0'|'1',
    namedetails?: '0'|'1',
}

export type NominatimGeoJson = {
    type: "MultiPolygon",
    coordinates: Coordinate[][][] | Coordinate[][] | Coordinate
}