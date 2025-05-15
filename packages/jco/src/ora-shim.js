// browser shim for ora
export default function ora () {
  return new Ora();
}

class Ora {
  start () {}
  stop () {}
}
