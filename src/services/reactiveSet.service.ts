import { Reactive } from "./reactive.service";

export class ReactiveSet<T> extends Reactive<Set<T>> {
  constructor() {
    super(new Set<T>());
  }

  add(value:T){
    this.value.add(value);
    this.update();
  }

  delete(value:T){
    this.value.delete(value);
    this.update();
  }

  clear(){
    this.value.clear();
    this.update();
  }

  has(value:T){
    return this.value.has(value);
  }

  get size():number{
    return this.value.size;
  }
}
