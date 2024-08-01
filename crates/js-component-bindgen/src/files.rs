use std::collections::btree_map::{BTreeMap, Entry};

#[derive(Default)]
pub struct Files {
    files: BTreeMap<String, Vec<u8>>,
}

impl Files {
    pub fn push(&mut self, name: &str, contents: &[u8]) {
        match self.files.entry(name.to_owned()) {
            Entry::Vacant(entry) => {
                entry.insert(contents.to_owned());
            }
            Entry::Occupied(ref mut entry) => {
                entry.get_mut().extend_from_slice(contents);
            }
        }
    }

    pub fn get_size(&mut self, name: &str) -> Option<usize> {
        self.files.get(name).map(|data| data.len())
    }

    pub fn remove(&mut self, name: &str) -> Option<Vec<u8>> {
        self.files.remove(name)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&'_ str, &'_ [u8])> {
        self.files.iter().map(|p| (p.0.as_str(), p.1.as_slice()))
    }
}

impl IntoIterator for Files {
    type Item = (String, Vec<u8>);
    type IntoIter = std::collections::btree_map::IntoIter<String, Vec<u8>>;

    fn into_iter(self) -> Self::IntoIter {
        self.files.into_iter()
    }
}
