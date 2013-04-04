(function() {

/**
 * Создает ns.Update
 * @class ns.Update
 * @param {ns.View} view Корневой view.
 * @param {Object} layout Layout для этого view, результат от ns.layout.page()
 * @param {Object} params Параметры, результат от ns.router()
 * @constructor
 * @example
 * var route = ns.router('/folder/123/message/456');
 * var layout = ns.layout.page(route.page, route.params);
 * var update = new ns.Update(AppBlock, layout, route.params);
 * update.start();
 */
ns.Update = function(view, layout, params) {
    /**
     * Корневой view.
     * @private
     * @type {ns.View}
     */
    this.view = view;

    // ищем layout от view
    if (this.view.id in layout) {
        this.layout = layout[this.view.id];

    } else {
        // если его нет - ругаемся
        throw "ns.Update: can't find view layout";
    }

    this.params = params;

    this.id = ++update_id;
};

//  ---------------------------------------------------------------------------------------------------------------  //

/**
 * Id последнего созданного update-а.
 * @type {Number}
 */
var update_id = -1;

/**
 * Порядок событий для View.
 * @type {Array}
 * @private
 */
ns.Update.prototype._EVENTS_ORDER = ['hide', 'htmldestroy', 'htmlinit', 'async', 'show', 'repaint'];

/**
 * Начинает работу updater'а.
 * @param [async=false] Флаг асинхронного updater'а.
 * @return {no.Promise}
 */
ns.Update.prototype.start = function(async) {
    var resultPromise = new no.Promise();

    var updated = this.view._getRequestViews({
        sync: [],
        async: []
    }, this.layout.views, this.params);

    var that = this;

    var models = views2models(updated.sync);
    var promise = ns.request.models(models)
        .then(function(r) {
            //TODO: check errors
            if (that._expired()) {
                resultPromise.reject();
            } else {
                that._update(async);
                //TODO: надо как-то закидывать ссылки на промисы от асинхронных view
                resultPromise.resolve();
            }
        });

    // Для каждого async-view запрашиваем его модели.
    // Когда они приходят, запускаем точно такой же update.
    updated.async.forEach(function(view) {
        var models = views2models( [ view ] );
        no.Promise.wait([
            promise,
            ns.request.models(models)
        ]).then(function(r) {
            //TODO: смотреть, что не запустился другой update
            if (!that._expired()) {
                var fakeLayout = {};
                fakeLayout[that.view.id] = that.layout;
                new ns.Update(that.view, fakeLayout, that.params).start(true);
            }
        });
    });

    return resultPromise;
};

/**
 * Обновляет DOM и триггерит нужные события
 * @param [async=false] Флаг асинхронного updater'а.
 * @private
 */
ns.Update.prototype._update = function(async) {
    //  TODO: Проверить, что не начался уже более новый апдейт.

    var params = this.params;
    var layout = this.layout;

    var tree = {
        'location': document.location,
        'layout-params': params,
        'views': {}
    };
    this.view._getUpdateTree(tree, layout.views, params);

    // если пустое дерево, то ничего не реднерим,
    // но кидаем события и скрываем/открываем блоки
    if (!ns.object.isEmpty(tree.views)) {
        var html = ns.tmpl(tree, null, '');
        var node = ns.html2node(html);
    }

    var viewEvents = {
        'async': [],
        'hide': [],
        'htmldestroy': [],
        'htmlinit': [],
        'show': [],
        'repaint': []
    };

    this.view._updateHTML(node, layout.views, params, {
        toplevel: true,
        async: async
    }, viewEvents);

    for (var i = 0, j = this._EVENTS_ORDER.length; i < j; i++) {
        var event = this._EVENTS_ORDER[i];
        var views = viewEvents[event];
        for (var k = views.length - 1; k >= 0; k--) {
            views[k].trigger(event, params);
        }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

/**
 * @return {Boolean} true in case another update was created after current update.
 * @private
 */
ns.Update.prototype._expired = function() {
    var expired = this.id < update_id;
    return expired;
};

// ----------------------------------------------------------------------------------------------------------------- //

function views2models(views) {
    var added = {};
    var models = [];

    for (var i = 0, l = views.length; i < l; i++) {
        var viewModels = views[i].models;
        for (var model_id in viewModels) {
            var model = viewModels[model_id];
            var key = model.key;
            if ( !added[key] ) {
                models.push(model);
                added[key] = true;
            }
        }
    }

    return models;
}

})();
