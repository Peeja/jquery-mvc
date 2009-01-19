/**
 * jquery.mvc.js
 * A simple model controller for jQuery. (ie. client side MVC)
 *
 * Copyright (c) 2007 Mark Gibson
 * Dual licensed under the MIT (MIT-LICENSE.txt)
 * and GPL (GPL-LICENSE.txt) licenses.
 *
 * There is a single model which is simply a Javascript object,
 * it is intended to contain more objects/arrays in a hierarchical fashion,
 * so that values may be referenced with a simple string.
 * Example: "/user/3/info/name"
 *
 * The model should be capable of being serialized to JSON, therefore it should
 * not contain functions, or circular references. 
 *
 * Anywhere in this API where a reference is required as an argument,
 * it may be supplied as a string path, eg: "/user/3/info/name", as an
 * array path, eg: ['user',3,'info','name'], or as DOM element (from
 * which a model reference will be obtained through the 'ref' attribute
 * hierarchy).
 *
 * Most functions also accept an optional context argument too, this should
 * be an absolute reference that relative references are resolved from.
 * If omitted then the context will be the root $.model
 *
 * @author Mark Gibson
 * @version 0.5
 */

(function($) {
	/**
	 * The global data model.
	 */
	$.model = {};
	
	/**
	 * Global options that affect the model functions
	 */
	$.modelOptions = {
		/**
		 * Create an array when a non-existent parent contains a numeric segment name.
		 * Example: for the path: '/user/3', if the /user doesn't exist it will be created as an array
		 * if this option is true, otherwise it is created as an object.
		 */
		createArrays: true,
		
		/**
		 * The default global context for relative references
		 */
		globalContext: '/',
		
		/**
		 * The attribute that the model path reference is obtained from
		 */
		refAttr: 'ref'
	};
	
	/**
	 * Get the model path as an array, from the given string, array or element.
	 */
	$.modelPath = function(ref, context) {
		if (ref === undefined || ref.isModelPath) return ref;
		
		if (ref.nodeType) {
			var refs = [];
			var accumRefs = function() {
				var attr = this.getAttribute($.modelOptions.refAttr);
				if (attr !== null) {
					refs.unshift(attr);
					if (attr.charAt(0) == '/') throw true;
				}
			};
			try {
				accumRefs.call(ref);
				$(ref).parents('[@'+$.modelOptions.refAttr+']').each(accumRefs);
			} catch (e) {}
			var ref = refs.join('/');
		}
		
		if (typeof ref == 'string') {
			var path = ref.split('/');
			
			if (path[0] == '') {	// An absolute path
				path.shift();
			} else {				// A relative path, resolve using the supplied context or the global context
				path = $.modelPath(context || $.modelOptions.globalContext).concat(path);
			}
			
		} else if (ref.constructor == Array) {
			var path = ref;
		} else {
			//console.log('Unknown ref: %o', ref);
			return;
		}
		
		path.toString = function() {
			return '/'+this.join('/');
		};
		path.isModelPath = true;
		
		return path;
	};
	
	/**
	 * Get the model path of the first element in the jQuery sequence.
	 */
	$.fn.modelPath = function(context) {
		if (this[0]) return $.modelPath(this[0], context);
	};
	
	/**
	 * Walk along a model path calling a given function for each component.
	 *
	 * The callback function is called with the parent object as 'this',
	 * and arguments of the entire path, and the index along the path.
	 *
	 * The value at the current position can be retreived with:
	 *  this[path[index]]
	 *
	 * The value at the end of the path is returned.
	 */
	$.modelWalk = function(ref, callback, context) {
		var path = $.modelPath(ref, context);
		if (path === undefined) return;
		var parent = $.model;
		for (var i = 0; i < path.length; i++) {
			callback.call(parent, path, i);
			parent = parent[path[i]];
		}
		return parent;
	};
	
	// Private utility for getting/setting/deleting a model value
	var modelValue = function(path, mode, value, src) {
		var parent, prop;
		
		// Walk the path, creating objects/arrays as necessary
		try {
			var currval = $.modelWalk(path, function(path, i) {
				prop = path[i];
				if (this[prop] === undefined && i < path.length-1) {
					// Do not create object when deleting
					if (mode == 2) throw new ReferenceError('Nothing to delete');
					
					// Create objects/arrays along the path
					this[prop] = isNaN(path[i+1]) || !$.modelOptions.createArrays ? {} : [];
				}
				parent = this;
			});
		} catch (ex) {
			if (mode == 2 && ex instanceof ReferenceError) {
				return;
			} else {
				throw ex;
			}
		}
		
		switch (mode) {
			case 1:	// Set
				if (parent[prop] !== value) {
					// Assign the new value to the model property
					parent[prop] = value;
					
					// Trigger update event on bound elements
					$.modelTrigger(path, undefined, 'set', src);
				}
				return parent[prop];
				
			case 2: // Delete
				if (parent.splice)
					parent.splice(prop, 1);
				else
					delete parent[prop];
					
				$.modelTrigger(path, undefined, 'delete', src);
				return currval;
				
			default: // Get
				return currval;
		}
	};
	
	/**
	 * Get a model value given it's path.
	 */
	$.modelGet = function(ref, context) {
		return modelValue($.modelPath(ref, context), 0);
	};
	
	/**
	 * Set a model value given it's path.
	 */
	$.modelSet = function(ref, value, context, src) {
		return modelValue($.modelPath(ref, context), 1, value, src);
	};
	
	/**
	 * Delete a model value given it's path.
	 */
	$.modelDelete = function(ref, context) {
		return modelValue($.modelPath(ref, context), 2);
	};
	
	/**
	 * Set default values for non-existent values
	 */
	$.modelDefaults = function(ref, defaults) {
		$.modelSet(ref, $.extend({}, defaults, $.modelGet(ref)));
	};
	
	/**
	 * Get the model value for the first element in the jQuery sequence.
	 */
	$.fn.modelGet = function(context) {
		return $.modelGet(this[0], context);
	};
	
	/**
	 * Get the model values for all the jQuery elements.
	 * Returns an array of values.
	 */
	$.fn.modelGetAll = function(context) {
		var r = [];
		this.each(function() {
			r.push($.modelGet(this, context));
		});
		return r;
	};
	
	/**
	 * Set the model value of all the jQuery elements.
	 */
	$.fn.modelSet = function(value, context, excludeSelf) {
		this.each(function() {
			$.modelSet(this, value, context, excludeSelf ? this : null);
		});
		return this;
	};
	
	/**
	 * Delete the model values referenced by the jQuery elements.
	 */
	$.fn.modelDelete = function(context) {
		this.each(function() {
			$.modelDelete(this, context);
		});
		return this;
	};
	
	/**
	 * List of elements or functions bound to model values.
	 * (path => element|function)
	 */
	$.modelBinding = {};
	
	/**
	 * Bind a function or element to a model property.
	 *
	 * When the property is modified the function is called
	 * or the 'update' event is triggered on the element.
	 *
	 * The callback function will get a object set as 'this' that contains
	 * the following properties:
	 *   value - the value.
	 *   path - the entire path of the target value.
	 *   pathIndex - the index within the path of the value above.
	 *   parent - the object/array that contains the value.
	 */
	$.modelBind = function(ref, obj, context) {
		var key = $.modelPath(ref, context).toString();
		
		if ($.modelBinding[key] === undefined)
			$.modelBinding[key] = [];
		
		$.modelBinding[key].push(obj || ref);
	};
	
	/**
	 * Unbind all elements/functions from the model value.
	 */
	$.modelUnbind = function(ref, context) {
		var key = $.modelPath(ref, context).toString();
		delete $.modelBinding[key];
	};
	
	/**
	 * Get the set of elements bound to a model value.
	 */
	$.modelGetBound = function(ref, context) {
		var key = $.modelPath(ref, context).toString();
		return $.modelBinding[key];
	};
	
	/**
	 * Trigger a model update event.
	 */
	$.modelTrigger = function(ref, context, event, src) {
		$.modelWalk(ref, function(path, i) {
			var bindings = $.modelBinding['/'+path.slice(0,i+1).join('/')];
			if (bindings) {
				var self = this;
				$.each(bindings, function(n, b) {
					var data = {
						value: self[path[i]],
						path: path,
						pathIndex: i,
						parent: self
					};
					if (typeof b == 'function') {
						b.call(data);
					} else if (b !== src) {
						$(b).trigger('update', [data]);
					}
				});
			}
		}, context);
	};
	
	/**
	 * Update elements from the model
	 */
	$.fn.updateFromModel = function() {
		return this.each(function() {
			var value = $.modelGet(this);
			
			if (value === undefined) return;
			
			if ('modelSetValue' in this && this.modelSetValue instanceof Function) {
				this.modelSetValue(value);
			} else {
				switch (this.type || 'html') {
					case 'checkbox':
					case 'radio':
						this.checked = value;
						break;
					case 'button':
					case 'reset':
					case 'submit':
						break;
					case 'html':
						$(this).html(value);
						break;
					default:
						this.value = value;
				}
			}
		});
	};
	
	/**
	 * Default handlers for 'change' and 'update' events when an element is bound to the model
	 */
	$.modelHandler = {
		change: function(event) {
			// Update the model from the element value
			var self = $(this);
			self.modelSet(self.getValue(), event.data, true);
		},
		update: function() {
			$(this).updateFromModel();
		},
		triggerChange: function() {
			$(this).trigger('change');
		}
	};
	
	/**
	 * Bind the model to the elements, so that changes to the element values
	 * are reflected automatically in the model and vis versa.
	 *
	 * If model data exists for the element, then the value of the element
	 * is set from this data.
	 */
	$.fn.modelBind = function(context) {
		$(this).filter('[@'+$.modelOptions.refAttr+']')
			.each(function() {
				$.modelBind(this, this, context);
			})
			.bind('change', context, $.modelHandler.change)
			.bind('update', $.modelHandler.update);
		
		// Force IE to trigger a change event when clicking a checkbox
		if ($.browser.msie) {
			$(this).filter(':checkbox[@'+$.modelOptions.refAttr+']')
				.bind('click', $.modelHandler.triggerChange);
		}
		
		return this;
	};
	
	/**
	 * Unbind the jQuery elements from the model.
	 */
	$.fn.modelUnbind = function(context) {
		$(this).filter('[@'+$.modelOptions.refAttr+']')
			.each(function() {
				$.modelUnbind(this);
			})
			.unbind('change', $.modelHandler.change)
			.unbind('update', $.modelHandler.update)
			.unbind('click', $.modelHandler.triggerChange);
			
		return this;
	};
	
	/**
	 * Get the value of an element.
	 *
	 * If a custom function: modelGetValue() is present on the element,
	 * it will be called to obtain the value. Otherwise an appropriate
	 * value is retreived depending on the type of element.
	 */
	$.fn.getValue = function() {
		var o = [];
		this.each(function() {
			var v;
			if ('modelGetValue' in this && this.modelGetValue instanceof Function) {
				v = this.modelGetValue();
			} else {
				switch (this.type) {
					case 'checkbox':
					case 'radio':
						v = this.checked;
						break;
					case 'select-one':
						v = this.selectedIndex >= 0
							? (this.options[this.selectedIndex].value
								|| this.options[this.selectedIndex].text)
							: null;
						break;
					case 'select-multiple':
						v = [];
						for (var i = 0; i < this.options.length; i++) {
							if (this.options[i].selected)
								v.push(this.options[i].value || this.options[i].text);
						}
						break;
					case 'button':
					case 'reset':
					case 'submit':
						break;
					default:
						v = this.value;
				}
			}
			o.push(v);
		});
		return o.length > 1 ? o : o[0];
	};
	
	/**
	 * Substitute model values into a template string.
	 *
	 * Model values placeholders are represented by a reference between curly braces.
	 * Example:
	 * "Page {/pager/page} of {/pager/pages}"
	 * 
	 * If a callback function is supplied, then values will be fed into this before
	 * being substituted, useful for URI (by passing encodeURIComponent)
	 */
	$.modelSub = function(template, callback, context) {
		var re = /\{([^\{\}]+)\}/g;
		var match;
		var result = template;
		var callback = callback || function(s) { return s; }
		while ((match = re.exec(template)) != null) {
			result = result.replace(match[0], callback($.modelGet(match[1], context)));
		}
		return result;
	};

})(jQuery);
