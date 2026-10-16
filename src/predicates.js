export const predicates = {
  'born-in': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['place'] },
  'born-on': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['timepoint'], singleTargetPerSubject: true },
  'died-in': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['place'] },
  'died-on': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['timepoint'], singleTargetPerSubject: true },
  'lived-in': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['place'] },
  'worked-in': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['place'] },
  'travelled-to': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['place'] },
  'ruled': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['place'] },
  'part-of': { subjectEntityTypes: ['place'], targetType: 'entity', targetEntityTypes: ['place'] },
  'mentioned-in': { subjectEntityTypes: ['person', 'place'], targetType: 'source' },
  'role': { subjectEntityTypes: ['person'], targetType: 'text' },
  'participated-in': { subjectEntityTypes: ['person'], targetType: 'entity', targetEntityTypes: ['event'] },
  'happened-at': { subjectEntityTypes: ['event'], targetType: 'entity', targetEntityTypes: ['place'] },
  'happened-on': { subjectEntityTypes: ['event'], targetType: 'entity', targetEntityTypes: ['timepoint'], singleTargetPerSubject: true },
  'has-sense': { subjectEntityTypes: ['word', 'phrase'], targetType: 'entity', targetEntityTypes: ['sense'] },
  'refers-to': { subjectEntityTypes: ['sense'], targetType: 'entity', targetEntityTypes: ['*'] },
  'attested-as': { subjectEntityTypes: ['word', 'phrase'], targetType: 'text' },
  'associated-with': { subjectEntityTypes: ['*'], targetType: 'entity', targetEntityTypes: ['*'] }
}

export const entityTypes = ['person', 'place', 'event', 'timepoint', 'word', 'phrase', 'sense']
