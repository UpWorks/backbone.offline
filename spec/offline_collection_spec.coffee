describe 'Offline.Collection', ->
  beforeEach ->
    localStorage.setItem('dreams', '')
    @dreams = new Dreams()
    @collection = new Offline.Collection(@dreams)

  afterEach ->
    localStorage.clear()

  describe 'dirty', ->
    it 'return items with dirty mark', ->
      @dreams.add [{id: 1, dirty: false}, {id: 2, dirty: true}, {id: 3, dirty: false}]
      expect(@collection.dirty().length).toEqual 1

  describe 'get', ->
    it 'finds item in collection by sid attribute', ->
      @dreams.add [{name: 'first', sid: '1'}, {name: 'second', sid: '2'}]
      expect(@collection.get('2').get 'name').toEqual('second')

  describe 'diff', ->
    beforeEach ->
      @dreams.create(name: 'item 1', sid: '1')
      @dreams.create(name: 'item 2', sid: '2')
      @dreams.create(name: 'item 3', sid: '3')

      @response = [{name: 'item 1', id: '1'}]

    it 'returns array of items to remove', ->
      expect(@collection.diff(@response)).toEqual(['2', '3'])

    it 'ignoring items with "new" sid', ->
      @dreams.create(name: 'item 4', sid: 'new')
      expect(@collection.diff(@response)).toEqual(['2', '3'])