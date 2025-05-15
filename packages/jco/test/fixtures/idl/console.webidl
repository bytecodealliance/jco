[Exposed=*]
interface console { // but see namespace object requirements below
  // Logging
  undefined assert(optional boolean condition = false, DOMString... data);
  undefined clear();
  undefined debug(DOMString... data);
  undefined error(DOMString... data);
  undefined info(DOMString... data);
  undefined log(DOMString... data);
  undefined table(optional DOMString tabularData, optional sequence<DOMString> properties);
  undefined trace(DOMString... data);
  undefined warn(DOMString... data);
  undefined dir(optional DOMString item);
  undefined dirxml(DOMString... data);

  // Counting
  undefined count(optional DOMString label = "default");
  undefined countReset(optional DOMString label = "default");

  // Grouping
  undefined group(DOMString... data);
  undefined groupCollapsed(DOMString... data);
  undefined groupEnd();

  // Timing
  undefined time(optional DOMString label = "default");
  undefined timeLog(optional DOMString label = "default", DOMString... data);
  undefined timeEnd(optional DOMString label = "default");
};