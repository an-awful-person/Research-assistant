import { type Coordinate } from "ol/coordinate";
import dayjs from "dayjs";
import { fromLonLat, toLonLat } from "ol/proj";
import { MAP_PROJECTION } from "../models/map.model";

/**
 * A set of usefull static tools under a single class umbrella.
 * Should function similar to other known libraries such as lowdash
 */
export class Utils {

  /**
   * @returns If a link goes to a web page, which uploaded documents for example don't have
   */
  static isWebLink(link: string): boolean {
    return /^https?:\/\//i.test(link);
  }

  static generateRandomId():string {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }
  
  /**
   * Creates the string for a random hex color.
   * @returns (string) hex string of a random color
   */
  static getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  /**
   * Compares to variables to see if their types are the same
   * @param input variable
   * @param compareType variable of type you want it to compare to
   * @returns boolean
   */
  static typeEquality<I, T>(input: I, compareType: T): boolean {
    return typeof input === typeof compareType;
  }

  static typeName():string{
    class MyClass{}
    return MyClass.name.replace(/<.*?>/g, '');    
  }

  /**
   * Creates a new map object of an imported map object. Used for React useState to notice changes, since it does not know how to handle more complex arrays.
   * @param map the map array that is updated but needs to be converted for the useState setter
   * @returns new object of the imported map
   */
  static newMap<K, V>(map: Map<K, V>): Map<K, V> {
    const newMap: Map<K, V> = new Map<K, V>();
    map.forEach((value, key) => {
      newMap.set(key, value);
    });
    return newMap;
  }

  /**
   * Creates a new set object of an imported set object. Used for React useState to notice changes, since it does not know how to handle more complex arrays.
   * @param set the set array that is updated but needs to be converted for the useState setter
   * @returns new object of the imported set
   */
  static newSet<T>(set: Set<T>): Set<T> {
    const newSet: Set<T> = new Set<T>();
    set.forEach((value) => {
      newSet.add(value);
    });
    return newSet;
  }

  /**
   * Creates a new array object of an imported array object. Used for React useState to notice changes, since it does not know how to handle more complex arrays.
   * @param array the array that is updated but needs to be converted for the useState setter
   * @returns new object of the imported array
   */
  static newArray<T>(array:T[]):T[] {
    const newArray: T[] = [];
    array.forEach(value => {
      newArray.push(value);
    })
    return newArray;
  }

  static rgb2rgba(colorString: string, opacity: number): string {
    const matches = colorString.match(
      /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/
    );
    let rgba = "";
    if (matches != null) {
      rgba = `rgba(${matches[1]},${matches[2]},${matches[3]},${opacity})`;
    }
    return rgba;
  }

  static rgba2rgbo(colorString: string): { rgb: string; opacity: number } {
    // return rgb and opacity
    const matches = colorString.match(
      /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}.?\d*)/
    );
    let rgb = "";
    let opacity = 1;
    if (matches != null) {
      rgb = `rgb(${matches[1]},${matches[2]},${matches[3]})`;
      opacity = parseFloat(matches[4]);
    }
    return { rgb: rgb, opacity: opacity };
  }

  static toNum(colorString: string): number {
    const matches = colorString.match(
      /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{0,1}.\d*)/
    );
    let num = 0;
    if (matches != null) {
      const red = parseInt(matches[1]);
      const green = parseInt(matches[2]);
      const blue = parseInt(matches[3]);
      const alpha = Utils.round(parseFloat(matches[4]), 2) * 255;
      num = (red << 16) | (green << 8) | blue | (alpha << 24);
    }
    return num;
  }

  static stringColorHasAlpha(colorString: string): boolean {
    const matches = colorString.match(
      /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{0,1}.\d*)/
    );
    return matches != null && matches.length >= 4;
  }

  /**
   * Round number to a certain decimal
   * @param value
   * @param decimal 
   * @returns rounded value
   */
  static round(value: number, decimal: number): number {
    return Math.round(value * Math.pow(10,decimal)) / Math.pow(10,decimal);
  }

  /**
   * 
   * @param text 
   * @returns text but with a capital in the first letter
   */
  static capitalizeFirstLetter(text:string): string {
    if(text && text.length > 0){
      return text.charAt(0).toUpperCase() + text.slice(1);
    } else {
      return text;
    }    
  }

  /**
   * Converts data to a new range
   * @param input data value you want to use
   * @param inMin minimal value of data
   * @param inMax maximal value of data
   * @param outMin converted to this minimal value
   * @param outMax converted to this maximal value
   * @returns converted data value
   */
  static convertRange(input:number, inMin:number, inMax:number, outMin:number, outMax:number):number{
    return (input - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
  }

  /**
   * Used to simplify input text for text comparison. So that spaces or capicals can be ignored.
   * @param text input text
   * @returns a simplified version of the text
   */
  static simplifyString(text:string):string{
    return text.toLocaleLowerCase().trim();
  }

  /**
   * 
   * @param dateString date string in format YYYY-MM-DDTHH:MM:SS.SSSSSSSZ
   * @returns if the string is a date time string
   */
  static isDateTimeString(dateString: string): boolean {
    return dayjs(dateString).isValid();
  }

  /**
   * 
   * @param possibleDate date in format Date, string or number
   * @returns if the possibleDate object is a valid date
   */
  static isValidDate(possibleDate: Date | string | number): boolean {
    if (possibleDate && Object.prototype.toString.call(possibleDate) === "[object Date]" || possibleDate && typeof possibleDate === 'string' && Object.prototype.toString.call(new Date(possibleDate)) === "[object Date]") {
      return true;
    } else {
      return false;
    }
  }

  /**
   * 
   * @param epochDate date in seconds
   * @returns if the number is a valid epoch date
   * @deprecated doesn't work good enough and gives false flags
   */
  static isValidEpochDate(epochDate: number): boolean {
    // Check if the number is an integer
    if (!Number.isInteger(epochDate)) {
      return false;
    }
  
    // Try to convert the epoch date to a Day.js object
    const date = dayjs.unix(epochDate);
  
    // Check if the year is 1970 for a buffer of values to prevent false flags
    if(date.year() === 1970 || date.year() === 1969){
      return false;
    }

    // Check if the date is valid
    return date.isValid();
  }

  static convertDegreesToRadians(degrees:number){
    return degrees * (Math.PI / 180);
  }

  static convertRadiansToDegrees(radians:number){
    return radians * (180 / Math.PI);
  }

  /**
   * 
   * @param coor expects degrees
   * @returns coordinate from -180 to 180
   */
  static filterAntimeridianCrossing(coor:Coordinate, projection?:MAP_PROJECTION):Coordinate {
    if(projection){
      coor = toLonLat(coor, projection);
    }
    coor[0] = this.convertRadiansToDegrees(Math.sin(this.convertDegreesToRadians(coor[0])));
    // coor[1] = this.convertRadiansToDegrees(Math.sin(this.convertDegreesToRadians(coor[1])));
    if(projection){
      return fromLonLat(coor, projection);
    } else {
      return coor;
    }    
  }
}
