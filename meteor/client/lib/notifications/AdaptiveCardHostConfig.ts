import * as AdaptiveCards from 'adaptivecards'
export const HostConfig = new AdaptiveCards.HostConfig({
	"choiceSetInputValueSeparator": ",",
	"supportsInteractivity": true,
	"spacing": {
		"small": 4,
		"default": 8,
		"medium": 12,
		"padding": 16,
		"large": 20,
		"extraLarge": 32
	},
	"separator": {
		"lineThickness": 1,
		"lineColor": "#E6E6E6"
	},
	"imageSizes": {
		"small": 32,
		"medium": 48,
		"large": 96
	},
	"fontTypes": {
		"default": {
			"fontFamily": "Roboto, arial, sans-serif",
			"fontSizes": {
				"small": 12,
				"default": 14,
				"medium": 14,
				"large": 18,
				"extraLarge": 24
			},
			"fontWeights": {
				"lighter": 200,
				"default": 400,
				"bolder": 600
			}
		},
		"monospace": {
			"fontFamily": "'Consolas', 'Courier New', Courier, monospace",
			"fontSizes": {
				"small": 12,
				"default": 14,
				"medium": 14,
				"large": 18,
				"extraLarge": 24
			},
			"fontWeights": {
				"lighter": 200,
				"default": 400,
				"bolder": 600
			}
		}
	},
	"containerStyles": {
		"default": {
			"foregroundColors": {
				"default": {
					"default": "#000000",
					"subtle": "#737373"
				},
				"dark": {
					"default": "#000000",
					"subtle": "#737373"
				},
				"light": {
					"default": "#FFFFFF",
					"subtle": "#D2D2D2"
				},
				"accent": {
					"default": "#0078D4",
					"subtle": "#004D8C"
				},
				"good": {
					"default": "#107C10",
					"subtle": "#0B6A0B"
				},
				"warning": {
					"default": "#CA5010",
					"subtle": "#8E562E"
				},
				"attention": {
					"default": "#C50F1F",
					"subtle": "#A80000"
				}
			},
			"backgroundColor": "#ffffff"
		},
		"emphasis": {
			"foregroundColors": {
				"default": {
					"default": "#000000",
					"subtle": "#737373"
				},
				"dark": {
					"default": "#000000",
					"subtle": "#737373"
				},
				"light": {
					"default": "#FFFFFF",
					"subtle": "#D2D2D2"
				},
				"accent": {
					"default": "#0078D4",
					"subtle": "#004D8C"
				},
				"good": {
					"default": "#107C10",
					"subtle": "#0B6A0B"
				},
				"warning": {
					"default": "#CA5010",
					"subtle": "#8E562E"
				},
				"attention": {
					"default": "#C50F1F",
					"subtle": "#A80000"
				}
			},
			"backgroundColor": "#F2F2F2"
		},
		"accent": {
			"foregroundColors": {
				"default": {
					"default": "#000000",
					"subtle": "#737373"
				},
				"dark": {
					"default": "#000000",
					"subtle": "#737373"
				},
				"light": {
					"default": "#FFFFFF",
					"subtle": "#D2D2D2"
				},
				"accent": {
					"default": "#0078D4",
					"subtle": "#004D8C"
				},
				"good": {
					"default": "#107C10",
					"subtle": "#0B6A0B"
				},
				"warning": {
					"default": "#CA5010",
					"subtle": "#8E562E"
				},
				"attention": {
					"default": "#C50F1F",
					"subtle": "#A80000"
				}
			},
			"backgroundColor": "#E5F1FA"
		},
		"good": {
			"foregroundColors": {
				"default": {
					"default": "#FFFFFF",
					"subtle": "#D4E7D4"
				},
				"dark": {
					"default": "#000000",
					"subtle": "#073707"
				},
				"light": {
					"default": "#FFFFFF",
					"subtle": "#D4E7D4"
				},
				"accent": {
					"default": "#0078D4",
					"subtle": "#004D8C"
				},
				"good": {
					"default": "#107C10",
					"subtle": "#0B6A0B"
				},
				"warning": {
					"default": "#CA5010",
					"subtle": "#8E562E"
				},
				"attention": {
					"default": "#C50F1F",
					"subtle": "#A80000"
				}
			},
			"backgroundColor": "#107C10"
		},
		"attention": {
			"foregroundColors": {
				"default": {
					"default": "#FFFFFF",
					"subtle": "#F4D4D7"
				},
				"dark": {
					"default": "#000000",
					"subtle": "#58060D"
				},
				"light": {
					"default": "#FFFFFF",
					"subtle": "#F4D4D7"
				},
				"accent": {
					"default": "#0078D4",
					"subtle": "#004D8C"
				},
				"good": {
					"default": "#107C10",
					"subtle": "#0B6A0B"
				},
				"warning": {
					"default": "#CA5010",
					"subtle": "#8E562E"
				},
				"attention": {
					"default": "#C50F1F",
					"subtle": "#A80000"
				}
			},
			"backgroundColor": "#C50F1F"
		},
		"warning": {
			"backgroundColor": "#FCE100",
			"foregroundColors": {
				"default": {
					"default": "#000000",
					"subtle": "#716500"
				},
				"dark": {
					"default": "#000000",
					"subtle": "#716500"
				},
				"light": {
					"default": "#FFFFFF",
					"subtle": "#FEF9D2"
				},
				"accent": {
					"default": "#0078D4",
					"subtle": "#004D8C"
				},
				"good": {
					"default": "#107C10",
					"subtle": "#0B6A0B"
				},
				"warning": {
					"default": "#CA5010",
					"subtle": "#8E562E"
				},
				"attention": {
					"default": "#C50F1F",
					"subtle": "#A80000"
				}
			}
		}
	},
	"actions": {
		"maxActions": 6,
		"spacing": "Default",
		"buttonSpacing": 8,
		"showCard": {
			"actionMode": "Inline",
			"inlineTopMargin": 16,
			"style": "emphasis"
		},
		"preExpandSingleShowCardAction": false,
		"actionsOrientation": "Horizontal",
		"actionAlignment": "Left"
	},
	"adaptiveCard": {
		"allowCustomStyle": false
	},
	"imageSet": {
		"imageSize": "Medium",
		"maxImageHeight": 100
	},
	"factSet": {
		"title": {
			"size": "Default",
			"color": "Default",
			"isSubtle": false,
			"weight": "Bolder",
			"wrap": true,
			"maxWidth": 150
		},
		"value": {
			"size": "Default",
			"color": "Default",
			"isSubtle": false,
			"weight": "Default",
			"wrap": true
		},
		"spacing": 12
	}
})
