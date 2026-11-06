import { type Coordinate } from "ol/coordinate";
import { type Service } from "../../interfaces/service.interface";
import { NOMINATIM_OUTPUT_FORMAT,type NominatimJsonModel } from "../model/nominatim.model";
import { AssistantService } from "./assistant.service";
import { transform } from "ol/proj";
import { MAP_PROJECTION } from "../../models/map.model";

export class NominatimService implements Service {
  private _assistantService: AssistantService;

  public static readonly NOMINATIM_REVERSE_GEOCODING_URL =
    "https://nominatim.openstreetmap.org/reverse?lat=<lat_value>&lon=<lon_value>&<params>";

  public static readonly NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search?<params>";

  constructor(assistantService: AssistantService) {
    this._assistantService = assistantService;
  }

  init() {}

  exit() {}

  getReverseGeocodingUrl(
    coordinate: Coordinate,
    responseFormat: NOMINATIM_OUTPUT_FORMAT = NOMINATIM_OUTPUT_FORMAT.JSON,
    params?: { [key: string]: string }
  ): string {
    let newUrl = JSON.parse(
      JSON.stringify(NominatimService.NOMINATIM_REVERSE_GEOCODING_URL)
    );
    newUrl = newUrl.replace(
      "<lat_value>",
      encodeURIComponent(coordinate[1].toFixed(4))
    );
    newUrl = newUrl.replace(
      "<lon_value>",
      encodeURIComponent(coordinate[0].toFixed(4))
    );
    newUrl = newUrl.replace("<params>", `format=${responseFormat}`);

    if (params) {
      Array.from(Object.entries(params)).forEach((param) => {
        newUrl += `&${param[0]}=${param[1]}`;
      });
    }

    return newUrl;
  }

  reverseGeocodingCall(
    coordinate: Coordinate,
    projection: MAP_PROJECTION
  ): Promise<NominatimJsonModel> {
    if (projection !== MAP_PROJECTION.EPSG_4326) {
      coordinate = transform(coordinate, projection, MAP_PROJECTION.EPSG_4326);
    }

    return this._assistantService.apiService.apiCall<NominatimJsonModel>(
      this.getReverseGeocodingUrl(coordinate)
    );
  }

  searchCall(searchTerms:string):Promise<NominatimJsonModel[]>{
    return this._assistantService.apiService.apiCall(
      this._getSearchUrl(searchTerms,NOMINATIM_OUTPUT_FORMAT.JSON, {'polygon_geojson':'1','addressdetails':'1','extratags':'1'})
    )
  }

  private _getSearchUrl(
    searchTerms: string,
    responseFormat: NOMINATIM_OUTPUT_FORMAT = NOMINATIM_OUTPUT_FORMAT.JSON,
    params?: { [key: string]: string }
  ) {
    let newUrl = JSON.parse(
      JSON.stringify(NominatimService.NOMINATIM_SEARCH_URL)
    );

    newUrl = newUrl.replace('<params>',
      `q=${encodeURIComponent(searchTerms)}&format=${responseFormat}`
    )

    if (params) {
      Array.from(Object.entries(params)).forEach((param) => {
        newUrl += `&${param[0]}=${param[1]}`;
      });
    }
    return newUrl;
  }
}